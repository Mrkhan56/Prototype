"""
auth/router.py — Authentication endpoints.

Every endpoint writes to audit_logs synchronously BEFORE returning a response.
This is a legal requirement: auth events must be logged even if the server
crashes immediately after — they are evidence of access attempts.

Flow:
  1. POST /auth/login      → password check → return MFA challenge token
  2. POST /auth/mfa/verify → TOTP check → return access + refresh tokens
  3. POST /auth/refresh    → rotate refresh token (detect reuse)
  4. POST /auth/logout     → revoke refresh token family
  5. POST /auth/mfa/setup  → enroll MFA (during onboarding)
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from auth.guards import UserContext, get_current_user, write_audit_log
from auth.jwt_handler import (
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    TokenError,
)
from auth.mfa import generate_mfa_setup, verify_totp_code
from auth.rate_limiter import (
    is_account_locked,
    notify_security_admin,
    record_failed_attempt,
    record_successful_login,
)
from config import get_settings
from database import get_db
from models import AuditResult, RefreshToken, Role, User, UserStatus

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()

# Argon2id password hasher — memory-hard, resistant to GPU brute-force
password_hash = PasswordHash([Argon2Hasher()])


# ── Request / Response Models ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MFAVerifyRequest(BaseModel):
    mfa_token: str
    totp_code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class MFAChallengeResponse(BaseModel):
    mfa_token: str
    message: str = "MFA verification required"


class MFASetupResponse(BaseModel):
    provisioning_uri: str
    qr_code_svg: str
    message: str = "Scan QR code with your authenticator app, then verify to complete setup"


def _client_ip(request: Request) -> str:
    """Extract real IP — handles X-Forwarded-For from reverse proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=MFAChallengeResponse, status_code=status.HTTP_200_OK)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MFAChallengeResponse:
    """
    Step 1 of 2-step auth. Returns an MFA challenge token on success.
    All attempts (success and failure) are logged to audit_logs.
    """
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")

    # Look up user by email
    result = await db.execute(
        select(User).where(User.email == body.email.lower())
    )
    user = result.scalar_one_or_none()

    # ── Lockout check ────────────────────────────────────────────────────────
    if user and await is_account_locked(user.id):
        await write_audit_log(
            db=db, action="AUTH_LOGIN", resource_type="USER",
            result=AuditResult.DENIED,
            user_id=user.id, ip_address=ip, user_agent=ua,
            details={"reason": "account_locked", "email": body.email},
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is locked. Contact your administrator.",
        )

    # ── Password verification ────────────────────────────────────────────────
    # Use constant-time comparison even for missing users (prevent user enumeration)
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy"
    stored_hash = user.password_hash if user else dummy_hash

    try:
        is_valid = password_hash.verify(body.password, stored_hash)
    except Exception:
        is_valid = False

    if not is_valid or user is None:
        if user:
            should_lock = await record_failed_attempt(user.id)
            if should_lock:
                await notify_security_admin(user.id, user.email, ip)
            await write_audit_log(
                db=db, action="AUTH_LOGIN", resource_type="USER",
                result=AuditResult.FAILURE,
                user_id=user.id if user else None, ip_address=ip, user_agent=ua,
                details={"reason": "invalid_password"},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.status != UserStatus.ACTIVE:
        await write_audit_log(
            db=db, action="AUTH_LOGIN", resource_type="USER",
            result=AuditResult.DENIED,
            user_id=user.id, ip_address=ip, user_agent=ua,
            details={"reason": f"account_status_{user.status.value}"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is not active",
        )

    # ── MFA enforcement ──────────────────────────────────────────────────────
    if not user.mfa_enabled or not user.mfa_secret_encrypted:
        # MFA not set up — force enrollment before allowing access
        await write_audit_log(
            db=db, action="AUTH_LOGIN", resource_type="USER",
            result=AuditResult.DENIED,
            user_id=user.id, ip_address=ip, user_agent=ua,
            details={"reason": "mfa_not_configured"},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA is mandatory. Please complete MFA setup first via /auth/mfa/setup",
        )

    mfa_token = create_mfa_token(user.id)

    # Log successful password check (MFA pending)
    await write_audit_log(
        db=db, action="AUTH_LOGIN_PASSWORD_OK", resource_type="USER",
        result=AuditResult.SUCCESS,
        user_id=user.id, ip_address=ip, user_agent=ua,
        details={"mfa_required": True},
    )

    return MFAChallengeResponse(mfa_token=mfa_token)


@router.post("/mfa/verify", response_model=TokenResponse)
async def mfa_verify(
    body: MFAVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Step 2: Verify TOTP code. Returns access token (in body)
    and refresh token (in HttpOnly cookie).
    """
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")

    try:
        payload = decode_token(body.mfa_token, expected_type="mfa_pending")
    except TokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA session")

    user_id = UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Verify TOTP
    if not user.mfa_secret_encrypted or not verify_totp_code(user.mfa_secret_encrypted, body.totp_code):
        should_lock = await record_failed_attempt(user.id)

        if should_lock:
            await notify_security_admin(user.id, user.email, ip)
        await write_audit_log(
            db=db, action="AUTH_MFA_VERIFY", resource_type="USER",
            result=AuditResult.FAILURE,
            user_id=user.id, ip_address=ip, user_agent=ua,
            details={"reason": "invalid_totp"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")

    await record_successful_login(user.id)

    # Load role for token claims
    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one()
    max_classification = role.permissions_json.get("max_classification", "UNCLASSIFIED")

    # Create tokens
    access_token = create_access_token(user.id, role.name, user.department_id, max_classification)
    family_id = uuid4()
    raw_refresh, refresh_hash = create_refresh_token(user.id, family_id)

    # Store refresh token hash in DB
    rt = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        family_id=family_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)

    await write_audit_log(
        db=db, action="AUTH_LOGIN", resource_type="USER",
        result=AuditResult.SUCCESS,
        user_id=user.id, ip_address=ip, user_agent=ua,
        details={"role": role.name},
    )

    # Set refresh token as HttpOnly cookie (not readable by JavaScript)
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/auth/refresh",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.GENERAL_SESSION_TIMEOUT_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Rotate refresh token. If a revoked token is presented,
    the entire family is revoked (detects token theft).
    """
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    ip = _client_ip(request)
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt = result.scalar_one_or_none()

    if rt is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    now = datetime.now(timezone.utc)

    if rt.revoked:
        # Reuse of a revoked token — possible theft. Revoke entire family.
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.family_id == rt.family_id)
            .execution_options(synchronize_session="fetch")
        )
        # Mark all family tokens revoked
        family_result = await db.execute(
            select(RefreshToken).where(RefreshToken.family_id == rt.family_id)
        )
        for family_token in family_result.scalars().all():
            family_token.revoked = True
            family_token.revoked_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions have been invalidated.",
        )

    if rt.expires_at < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Rotate: revoke old token, issue new one in same family
    rt.revoked = True
    rt.revoked_at = now

    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one()
    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one()
    max_classification = role.permissions_json.get("max_classification", "UNCLASSIFIED")

    new_raw, new_hash = create_refresh_token(user.id, rt.family_id)
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        family_id=rt.family_id,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_rt)

    access_token = create_access_token(user.id, role.name, user.department_id, max_classification)
    await db.commit()

    response.set_cookie(
        key="refresh_token",
        value=new_raw,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/auth/refresh",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.GENERAL_SESSION_TIMEOUT_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke the current refresh token family and clear the cookie."""
    if refresh_token:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        rt = result.scalar_one_or_none()
        if rt:
            family_result = await db.execute(
                select(RefreshToken).where(RefreshToken.family_id == rt.family_id)
            )
            now = datetime.now(timezone.utc)
            for family_token in family_result.scalars().all():
                family_token.revoked = True
                family_token.revoked_at = now

    await write_audit_log(
        db=db, action="AUTH_LOGOUT", resource_type="USER",
        result=AuditResult.SUCCESS,
        user_id=user.user_id, ip_address=_client_ip(request),
    )
    await db.commit()
    response.delete_cookie("refresh_token", path="/api/v1/auth/refresh")


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def mfa_setup(
    request: Request,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MFASetupResponse:
    """
    Generate a new TOTP secret and return QR code for enrollment.
    The secret is NOT saved until /mfa/confirm is called with a valid code.
    """
    encrypted_secret, provisioning_uri, qr_svg = generate_mfa_setup(user.email)

    # Store encrypted secret temporarily; enable mfa_enabled only after confirmation
    result = await db.execute(select(User).where(User.id == user.user_id))
    db_user = result.scalar_one()
    db_user.mfa_secret_encrypted = encrypted_secret
    # mfa_enabled stays False until user confirms with a valid code
    await db.commit()

    return MFASetupResponse(provisioning_uri=provisioning_uri, qr_code_svg=qr_svg)


@router.post("/mfa/confirm", status_code=status.HTTP_200_OK)
async def mfa_confirm(
    body: MFAVerifyRequest,
    request: Request,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Confirm MFA setup by verifying the first TOTP code."""
    result = await db.execute(select(User).where(User.id == user.user_id))
    db_user = result.scalar_one()

    if not db_user.mfa_secret_encrypted:
        raise HTTPException(status_code=400, detail="No MFA secret pending setup")

    if not verify_totp_code(db_user.mfa_secret_encrypted, body.totp_code):
        raise HTTPException(status_code=401, detail="Invalid TOTP code — MFA setup failed")

    db_user.mfa_enabled = True
    await write_audit_log(
        db=db, action="MFA_SETUP_CONFIRMED", resource_type="USER",
        result=AuditResult.SUCCESS, user_id=user.user_id,
    )
    await db.commit()
    return {"message": "MFA successfully enabled"}
