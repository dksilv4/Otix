# TODO: Review this file
from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy import select as sa_select
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
    from sqlalchemy.dialects.postgresql import insert as pg_insert

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
                    from otix.domain.base import get_expected_media_types
                    expected_media_types = get_expected_media_types(entity_type, obj)
                    clauses = [
                        ExternalID.provider == provider,
                        ExternalID.external_id == str_val,
                        ExternalID.entity_type.is_(None),
                    ]
                    if expected_media_types:
                        clauses.append(ExternalID.media_type.in_(expected_media_types))

                    legacy = session.scalar(sa_select(ExternalID).where(*clauses))
                    if legacy is not None:
                        # Atomically INSERT-or-confirm the target row, then delete
                        # the legacy stub.  The INSERT is safe under concurrency
                        # (ON CONFLICT DO NOTHING).  After this, the canonical row
                        # exists and the stub is redundant regardless of which
                        # session won the race.
                        session.execute(
                            pg_insert(ExternalID).values(
                                provider=provider,
                                external_id=str_val,
                                entity_type=entity_type,
                                entity_id=entity_id,
                                media_item_id=entity_id if entity_type == "media_item" else None,
                            ).on_conflict_do_nothing(constraint="uq_external_id_provider_ext")
                        )
                        session.delete(legacy)
                    else:
                        # Use INSERT ON CONFLICT DO NOTHING so a concurrent
                        # upsert that already created this row doesn't cause a
                        # duplicate-key violation during flush.
                        session.execute(
                            pg_insert(ExternalID).values(
                                provider=provider,
                                external_id=str_val,
                                entity_type=entity_type,
                                entity_id=entity_id,
                                media_item_id=entity_id if entity_type == "media_item" else None,
                            ).on_conflict_do_nothing(constraint="uq_external_id_provider_ext")
                        )
            elif existing is not None:
                session.delete(existing)


def _get_engine() -> AsyncEngine:
    global _engine, _pid, _session_factory
    current_pid = os.getpid()

    if _engine is not None and _pid != current_pid:
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
            connect_args={
                "timeout": settings.db_connect_timeout,
                "statement_cache_size": 0,
            },
        )

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


if not event.contains(Session, "after_flush", _process_pending_external_ids):
    event.listen(Session, "after_flush", _process_pending_external_ids)


class Base(DeclarativeBase):
    pass


def async_session():
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
