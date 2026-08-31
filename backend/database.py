"""
database.py — Async SQLAlchemy engine, session factory, and RLS context manager.

Key design decisions:
  - asyncpg driver for async PostgreSQL — 3-4x faster than psycopg2 sync.
  - scoped_db_session() sets SET LOCAL session variables that power RLS
    policies. Using SET LOCAL (not SET) ensures variables are transaction-
    scoped and auto-cleared when the transaction ends — critical for
    connection-pool safety with PgBouncer or asyncpg pools.
  - The app service role (app_service) connects with minimal privileges;
    UPDATE/DELETE on audit_logs is revoked at the DB level as belt-and-suspenders
    alongside the trigger-based immutability enforcement.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from config import get_settings


settings = get_settings()

# Create the async engine with connection pooling
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,          # Validate connections before use
    pool_recycle=3600,           # Recycle connections after 1 hour
)

# Session factory — expire_on_commit=False avoids lazy-load issues after commit
AsyncSessionFactory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides a raw database session.
    Use scoped_db_session() when RLS context is needed (most cases).
    """
    async with AsyncSessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def scoped_db_session(
    user_id: UUID,
    user_role: str,
    department_id: UUID,
    max_classification: str,
) -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager that opens a DB session and sets RLS session variables
    for the current user. All variables use SET LOCAL so they are strictly
    scoped to this transaction and auto-cleared on commit/rollback.

    Usage:
        async with scoped_db_session(user.id, user.role, ...) as db:
            result = await db.execute(select(Document))

    Args:
        user_id:            The authenticated user's UUID
        user_role:          Role name string (e.g., 'INVESTIGATING_OFFICER')
        department_id:      The user's department UUID
        max_classification: Highest classification the user can access
    """
    async with AsyncSessionFactory() as session:
        async with session.begin():
            # Set transaction-local variables for RLS policy evaluation.
            # These are automatically cleared when the transaction ends.
            await session.execute(
                text("""
                    SELECT
                        set_config('app.current_user_id', :uid, true),
                        set_config('app.current_user_role', :role, true),
                        set_config('app.current_user_department', :dept, true),
                        set_config('app.current_max_classification', :classification, true)
                """),
                {
                    "uid": str(user_id),
                    "role": user_role,
                    "dept": str(department_id),
                    "classification": max_classification,
                },
            )
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
