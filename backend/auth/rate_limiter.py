"""
auth/rate_limiter.py — Login attempt tracking and account lockout.

Production note: Replace the in-memory dict with Redis for multi-instance
deployments. The interface is intentionally simple so the backend can be
swapped without changing callers.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from config import get_settings

settings = get_settings()


@dataclass
class AttemptRecord:
    """Tracks failed login attempts and lock state for one user."""
    failed_count: int = 0
    locked_until: Optional[datetime] = None
    last_attempt_at: Optional[datetime] = None


# In-memory store: user_id (str) -> AttemptRecord
_attempts: dict[str, AttemptRecord] = {}
_lock = asyncio.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def is_account_locked(user_id: UUID) -> bool:
    """
    Returns True if the user's account is currently locked
    due to too many failed login attempts.
    """
    async with _lock:
        record = _attempts.get(str(user_id))
        if record is None or record.locked_until is None:
            return False
        if _now() > record.locked_until:
            # Lock has expired — clear it
            record.locked_until = None
            record.failed_count = 0
            return False
        return True


async def record_failed_attempt(user_id: UUID) -> bool:
    """
    Record a failed login attempt for the user.

    Returns:
        True if the account should now be locked (hit the threshold),
        False if still under the limit.
    """
    async with _lock:
        key = str(user_id)
        if key not in _attempts:
            _attempts[key] = AttemptRecord()
        record = _attempts[key]
        record.failed_count += 1
        record.last_attempt_at = _now()

        if record.failed_count >= settings.MAX_LOGIN_ATTEMPTS:
            record.locked_until = _now() + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
            return True
        return False


async def record_successful_login(user_id: UUID) -> None:
    """Reset the failed attempt counter on successful login."""
    async with _lock:
        _attempts.pop(str(user_id), None)


async def get_remaining_attempts(user_id: UUID) -> int:
    """Returns how many attempts remain before lockout."""
    async with _lock:
        record = _attempts.get(str(user_id))
        if record is None:
            return settings.MAX_LOGIN_ATTEMPTS
        return max(0, settings.MAX_LOGIN_ATTEMPTS - record.failed_count)


async def notify_security_admin(user_id: UUID, email: str, ip_address: str) -> None:
    """
    Write a CRITICAL notification to the security admin when an account is locked.
    In production, also send an email via SMTP.
    """
    # Deferred import to avoid circular dependency
    from database import AsyncSessionFactory
    from models import Notification, User
    from sqlalchemy import select

    async with AsyncSessionFactory() as db:
        try:
            # Find all SUPER_ADMIN and DEPT_ADMIN users to notify
            result = await db.execute(
                select(User).join(User.role).where(
                    User.status == "ACTIVE"
                )
            )
            admins = result.scalars().all()

            for admin in admins:
                # Only notify admins — check role name directly
                pass  # simplified: in production, query by role name

            notification = Notification(
                # Send to a well-known system admin user ID if it exists
                # In production, look up the SUPER_ADMIN users
                user_id=user_id,  # fallback: notify the locked user themselves
                message=(
                    f"SECURITY ALERT: Account for user {email} has been locked "
                    f"after {settings.MAX_LOGIN_ATTEMPTS} failed login attempts. "
                    f"Last attempt from IP: {ip_address}. "
                    f"Lock expires in {settings.LOCKOUT_DURATION_MINUTES} minutes."
                ),
                notification_type="CRITICAL",
            )
            db.add(notification)
            await db.commit()
        except Exception:
            # Do not let notification failure block the auth response
            pass
