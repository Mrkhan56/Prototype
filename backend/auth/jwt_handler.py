"""
auth/jwt_handler.py — JWT creation and verification.

Uses RS256 (asymmetric RSA) so the public key can be shared with other
services for token verification without exposing the signing secret.
Tokens include type claim to prevent token-type confusion attacks
(e.g., using an MFA challenge token as an access token).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from config import get_settings

settings = get_settings()


class TokenError(Exception):
    """Raised when token creation or validation fails."""
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    user_id: UUID,
    role: str,
    department_id: UUID,
    max_classification: str,
    is_classified_session: bool = False,
) -> str:
    """
    Create a short-lived JWT access token.

    Args:
        user_id:              The authenticated user's UUID
        role:                 Role name (e.g., 'INVESTIGATING_OFFICER')
        department_id:        User's department UUID
        max_classification:   Highest classification level user can access
        is_classified_session: If True, uses 15-min timeout; else 60-min
    """
    now = _utcnow()
    expire_minutes = (
        settings.CLASSIFIED_SESSION_TIMEOUT_MINUTES
        if is_classified_session
        else settings.GENERAL_SESSION_TIMEOUT_MINUTES
    )
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "access",
        "role": role,
        "department_id": str(department_id),
        "max_classification": max_classification,
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=expire_minutes),
        "iss": settings.JWT_ISSUER,
    }
    return jwt.encode(payload, settings.JWT_PRIVATE_KEY, algorithm=settings.JWT_ALGORITHM)


def create_mfa_token(user_id: UUID) -> str:
    """
    Create a very short-lived token issued after password check
    but before TOTP verification. Type 'mfa_pending' ensures it
    cannot be used as an access token.
    """
    now = _utcnow()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "mfa_pending",
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=settings.MFA_TOKEN_EXPIRE_MINUTES),
        "iss": settings.JWT_ISSUER,
    }
    return jwt.encode(payload, settings.JWT_PRIVATE_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: UUID, family_id: UUID) -> tuple[str, str]:
    """
    Create a refresh token and return (raw_token, sha256_hash).
    Only the hash is stored in the database — raw token is sent to client.

    The family_id groups tokens from one session. If an old (revoked)
    family token is reused, the entire family is invalidated (theft detection).
    """
    # Cryptographically random token — not a JWT, just a random string
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, token_hash


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """
    Decode and validate a JWT. Raises TokenError on any failure.

    Args:
        token:         The JWT string
        expected_type: 'access', 'mfa_pending', etc.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_PUBLIC_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            options={"require": ["sub", "type", "exp", "iat", "iss"]},
        )
    except ExpiredSignatureError:
        raise TokenError("Token has expired")
    except InvalidTokenError as exc:
        raise TokenError(f"Invalid token: {exc}")

    if payload.get("type") != expected_type:
        raise TokenError(
            f"Token type mismatch: expected '{expected_type}', got '{payload.get('type')}'"
        )
    return payload
