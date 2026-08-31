"""
database root package - re-exports database engine and session utilities from backend.database.
"""

from backend.database import (
    Base,
    engine,
    AsyncSessionFactory,
    get_db,
    scoped_db_session,
)

__all__ = [
    "Base",
    "engine",
    "AsyncSessionFactory",
    "get_db",
    "scoped_db_session",
]
