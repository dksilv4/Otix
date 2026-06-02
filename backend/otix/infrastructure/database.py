from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy import delete as sa_delete, event, select as sa_select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session

from otix.infrastructure.config import settings

_engine: AsyncEngine | None = None
_pid: int | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _process_pending_external_ids(session: Session, flush_context=None) -> None:
    """after_flush handler: persist any ExternalIDDescriptor values set on
    attached objects. Uses the sync session to avoid lazy='raise' issues on
    the _external_ids relationship.

    Runs after PK defaults are assigned (unlike before_flush) so new objects
    have their entity_id available for ExternalID row creation."""
    # Process _pending_external_ids on session.new and session.dirty
    # objects. _pending_external_ids is populated by
    # ExternalIDDescriptor.__set__, which also calls flag_modified() on
    # the first column to ensure attached objects appear in session.dirty.
    from otix.domain.media import ExternalID

    for obj in list(session.new) + list(session.dirty):
        pending = getattr(obj, "_pending_external_ids", None)
        if not pending:
            continue

        entity_type: str = getattr(obj, "__external_id_entity_type__", "")
        entity_id: str | None = getattr(obj, "id", None) or getattr(obj, "media_item_id", None)
        if not entity_id:
            continue

        for provider, value in list(pending.items()):
            existing = session.scalar(
                sa_select(ExternalID).where(
                    ExternalID.provider == provider,
                    ExternalID.entity_type == entity_type,
                    ExternalID.entity_id == entity_id,
                )
            )

            if value is not None:
                str_val = str(value)
                if existing is not None:
                    existing.external_id = str_val
                else:
                    # Check for a legacy stub (same provider+external_id
                    # but entity_type IS NULL from tmdb_seed daily import).
                    # Upgrade it in-place instead of inserting a new row
                    # that would violate the unique constraint.
                    legacy = session.scalar(
                        sa_select(ExternalID).where(
                            ExternalID.provider == provider,
                            ExternalID.external_id == str_val,
                            ExternalID.entity_type.is_(None),
                        )
                    )
                    if legacy is not None:
                        legacy.entity_type = entity_type
                        legacy.entity_id = entity_id
                    else:
                        session.add(
                            ExternalID(
                                provider=provider,
                                external_id=str_val,
                                entity_type=entity_type,
                                entity_id=entity_id,
                            )
                        )
            elif existing is not None:
                session.delete(existing)


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
            pool_recycle=300,
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


# Register the after_flush handler on the sync Session so ExternalID
# descriptor values set on attached objects are persisted automatically.
# Registered at module level (not inside _get_engine) so it works with any
# Session factory, including tests.
if not event.contains(Session, "after_flush", _process_pending_external_ids):
    event.listen(Session, "after_flush", _process_pending_external_ids)


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
