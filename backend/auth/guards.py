"""
auth/guards.py — FastAPI dependencies for authentication and authorization.

Implements a dual-check access model:
  1. Role-level check: Does the user's role permit the requested action/doc type?
  2. Resource-level check: Is the user explicitly assigned to this case/document?

Both checks must pass. A user with the right role but no case assignment
is still denied (principle of least privilege).
"""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from auth.jwt_handler import TokenError, decode_token
from database import get_db
from models import (
    AccessControl,
    AuditLog,
    AuditResult,
    ClassificationLevel,
    Document,
    DocType,
    User,
    Role,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# Classification level ordering for comparison
_CLASSIFICATION_RANK = {
    "UNCLASSIFIED": 0,
    "RESTRICTED": 1,
    "CONFIDENTIAL": 2,
    "SECRET": 3,
}


@dataclass
class UserContext:
    """
    Extracted and validated JWT claims — passed as a dependency
    to all authenticated endpoints.
    """
    user_id: UUID
    email: str
    role: str
    department_id: UUID
    max_classification: str
    permissions: dict  # From roles.permissions_json


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """
    Decode and validate the JWT, load user + role from DB,
    attach UserContext to request.state.user.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token, expected_type="access")
    except TokenError:
        raise credentials_exc

    user_id = UUID(payload["sub"])

    # Load user with role to get permissions_json
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None or user.status.value != "ACTIVE":
        raise credentials_exc

    role_result = await db.execute(select(Role).where(Role.id == user.role_id))
    role = role_result.scalar_one_or_none()
    if role is None:
        raise credentials_exc

    ctx = UserContext(
        user_id=user.id,
        email=user.email,
        role=role.name,
        department_id=user.department_id,
        max_classification=role.permissions_json.get("max_classification", "UNCLASSIFIED"),
        permissions=role.permissions_json,
    )
    request.state.user = ctx
    return ctx


def require_role(*allowed_roles: str):
    """
    Dependency factory that checks the user has one of the specified roles.

    Usage:
        @router.get("/admin", dependencies=[Depends(require_role("SUPER_ADMIN", "DEPT_ADMIN"))])
    """
    async def _check(user: UserContext = Depends(get_current_user)) -> UserContext:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role privileges for this operation",
            )
        return user
    return _check


def require_classification(min_level: str):
    """
    Dependency factory: user's max_classification must be >= min_level.
    """
    async def _check(user: UserContext = Depends(get_current_user)) -> UserContext:
        user_rank = _CLASSIFICATION_RANK.get(user.max_classification, 0)
        required_rank = _CLASSIFICATION_RANK.get(min_level, 0)
        if user_rank < required_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient classification clearance",
            )
        return user
    return _check


async def require_case_access(
    case_id: UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """
    Verify the user has an active, non-expired access_control entry
    for the specified case (or is SUPER_ADMIN / AUDITOR).
    """
    if user.role in ("SUPER_ADMIN", "AUDITOR"):
        return user

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(AccessControl).where(
            and_(
                AccessControl.case_id == case_id,
                AccessControl.is_active == True,
                or_(
                    AccessControl.user_id == user.user_id,
                    AccessControl.role_id.in_(
                        select(Role.id).where(Role.name == user.role)
                    ),
                ),
                or_(
                    AccessControl.expires_at == None,
                    AccessControl.expires_at > now,
                ),
            )
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this case",
        )
    return user


async def _check_document_access(
    document_id: UUID,
    user: UserContext,
    db: AsyncSession,
) -> Document:
    """
    Internal helper: enforces dual-check on document access.
      1. Fetch document and verify classification clearance.
      2. Verify user's role allows the document type.
      3. Verify active access_control entry.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    doc_result = await db.execute(select(Document).where(Document.id == document_id))
    doc = doc_result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # --- Check 1: Classification clearance ---
    user_rank = _CLASSIFICATION_RANK.get(user.max_classification, 0)
    doc_rank = _CLASSIFICATION_RANK.get(doc.classification_level.value, 0)
    if user_rank < doc_rank:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient classification clearance for this document",
        )

    # --- Check 2: Role permits this document type ---
    if user.role not in ("SUPER_ADMIN", "AUDITOR"):
        allowed_doc_types = user.permissions.get("allowed_doc_types", [])
        if doc.doc_type.value not in allowed_doc_types:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not permit access to this document type",
            )

    # --- Check 3: Active access grant ---
    if user.role not in ("SUPER_ADMIN", "AUDITOR"):
        result = await db.execute(
            select(AccessControl).where(
                and_(
                    or_(
                        AccessControl.document_id == document_id,
                        AccessControl.case_id == doc.case_id,
                    ),
                    AccessControl.is_active == True,
                    or_(
                        AccessControl.user_id == user.user_id,
                        AccessControl.role_id.in_(
                            select(Role.id).where(Role.name == user.role)
                        ),
                    ),
                    or_(
                        AccessControl.expires_at == None,
                        AccessControl.expires_at > now,
                    ),
                )
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this document",
            )

    return doc


async def require_document_access(
    document_id: UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """
    FastAPI dependency: enforces the dual-check (role + access grant)
    for document access. Raises 403/404 on failure.
    """
    await _check_document_access(document_id, user, db)
    return user


async def write_audit_log(
    db: AsyncSession,
    action: str,
    resource_type: str,
    result: AuditResult,
    user_id: Optional[UUID] = None,
    resource_id: Optional[UUID] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """
    Write a single audit log entry synchronously.
    The hash chain is computed by the DB trigger — we just provide data.

    IMPORTANT: This must be awaited BEFORE the response is returned,
    ensuring every authentication and access event is logged.
    """
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details or {},
        result=result,
        # Placeholder values — overwritten by DB trigger
        previous_log_hash="",
        current_log_hash="",
    )
    db.add(log)
    await db.commit()
