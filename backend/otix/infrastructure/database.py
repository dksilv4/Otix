from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from otix.infrastructure.config import settings

_engine: AsyncEngine | None = None
_pid: int | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _get_engine() -> AsyncEngine:
    global _engine, _pid, _session_factory
    current_pid = os.getpid()

    if _engine is not None and _pid != current_pid:
        # Process changed (Celery prefork child) — dispose the parent's pool
        # synchronously (connections are invalid in the child anyway).
        _engine.sync_engine.dispose()
        _engine = None
        _session_factory = None

    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_pre_ping=True,
            connect_args={"timeout": settings.db_connect_timeout},
        )

        # Set pg_trgm similarity threshold for the % operator used in search.
        @event.listens_for(_engine.sync_engine, "connect")
        def _set_pg_trgm_limit(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("SELECT set_limit(0.2)")
            cursor.close()

        _pid = current_pid
        _session_factory = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _engine


class Base(DeclarativeBase):
    pass


def async_session():
    """Get a session from a process-aware factory. Safe for Celery prefork workers."""
    _get_engine()
    return _session_factory()


async def dispose_engine() -> None:
    global _engine, _pid, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _pid = None
        _session_factory = None


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
