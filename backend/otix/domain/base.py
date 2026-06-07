# TODO: Review this file
from __future__ import annotations

import secrets
from datetime import datetime
from typing import Annotated

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column


def gen_otix_id() -> str:
    """Generate a unique otix_id in the format oti_XXXXXXXXXXXX."""
    return f"oti_{secrets.token_hex(6)}"


class ExternalIDDescriptor:
    """Descriptor that makes ExternalID table lookups feel like model columns.

    Usage:
        class Person(Base, HasExternalIDs):
            tmdb_id = ExternalIDDescriptor("tmdb", cast_type=int)
            imdb_id = ExternalIDDescriptor("imdb", cast_type=str)

        class Game(Base, HasExternalIDs):
            steam_app_id = ExternalIDDescriptor("steam", cast_type=int, entity_id_attr="media_item_id")
    """

    def __init__(self, provider: str, cast_type: type = str, entity_id_attr: str = "id") -> None:
        self.provider = provider
        self.cast_type = cast_type
        self.entity_id_attr = entity_id_attr

    def __set_name__(self, owner: type, name: str) -> None:
        self.attr_name = name

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        # Check pending values first (set on detached objects before flush)
        pending = getattr(obj, "_pending_external_ids", None)
        if pending and self.provider in pending:
            val = pending[self.provider]
            return self.cast_type(val) if val is not None else None
        for eid in getattr(obj, "_external_ids", []) or []:
            if eid.provider == self.provider:
                val = eid.external_id
                return self.cast_type(val) if val is not None else None
        return None

    def __set__(self, obj, value) -> None:
        from sqlalchemy.orm import object_session
        from sqlalchemy.orm.attributes import flag_modified

        # Always store to _pending_external_ids for descriptor read-back.
        pending = getattr(obj, "_pending_external_ids", None)
        if pending is None:
            pending = {}
            object.__setattr__(obj, "_pending_external_ids", pending)
        pending[self.provider] = value

        # If the object is attached, flag it as modified so the next
        # session.flush() fires before_flush, where
        # _process_pending_external_ids handles the actual DB upsert.
        # We flag the first column attribute to ensure the object
        # appears in session.dirty (object.__setattr__ bypasses
        # SQLAlchemy's normal dirty tracking).
        session = object_session(obj)
        if session is not None:
            mapper = getattr(obj.__class__, '__mapper__', None)
            if mapper is not None and mapper.column_attrs:
                col_key = list(mapper.column_attrs)[0].key
                flag_modified(obj, col_key)


class HasExternalIDs:
    """Mixin for models that use ExternalIDDescriptor accessors.

    Subclasses must define __external_id_entity_type__ and _external_ids relationship.
    """

    __external_id_entity_type__: str


def get_expected_media_types(entity_type: str, obj) -> list[str] | None:
    class_name = obj.__class__.__name__
    if entity_type == "media_item":
        if class_name == "Movie":
            return ["movie"]
        elif class_name == "Show":
            return ["show"]
        elif class_name == "Game":
            return ["game"]
        elif class_name == "Album":
            return ["music"]
        elif class_name == "MediaItem":
            mtype = getattr(obj, "media_type", None)
            if mtype:
                return [mtype]
    elif entity_type == "person":
        return ["person"]
    elif entity_type == "collection":
        return ["collection"]
    elif entity_type == "keyword":
        return ["keyword"]
    elif entity_type == "company":
        return ["company", "network"]
    return None


async def flush_pending_external_ids(obj, session) -> int:
    """Apply pending external IDs stored by ExternalIDDescriptor.__set__.

    Uses direct DB queries (never accesses _external_ids relationship, which
    has lazy='raise'). Call this after the object is attached and has a PK.

    Returns the number of ExternalID rows created/updated/deleted.
    """
    pending = getattr(obj, "_pending_external_ids", None)
    if not pending:
        return 0

    import structlog
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from otix.domain.media import ExternalID

    _log = structlog.get_logger()
    entity_type: str = getattr(obj, "__external_id_entity_type__", "")
    entity_id: str | None = getattr(obj, "id", None) or getattr(obj, "media_item_id", None)

    if not entity_id:
        return 0

    count = 0

    for provider, value in list(pending.items()):
        del pending[provider]

        existing = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == provider,
                ExternalID.entity_type == entity_type,
                ExternalID.entity_id == entity_id,
            )
        )

        if value is not None:
            str_val = str(value)
            if existing is not None:
                if existing.external_id != str_val:
                    existing.external_id = str_val
                    count += 1
            else:
                # Check for a legacy stub (same provider+external_id
                # but entity_type IS NULL from tmdb_seed daily import).
                expected_media_types = get_expected_media_types(entity_type, obj)
                clauses = [
                    ExternalID.provider == provider,
                    ExternalID.external_id == str_val,
                    ExternalID.entity_type.is_(None),
                ]
                if expected_media_types:
                    clauses.append(ExternalID.media_type.in_(expected_media_types))

                legacy = await session.scalar(select(ExternalID).where(*clauses))
                if legacy is not None:
                    legacy.entity_type = entity_type
                    legacy.entity_id = entity_id
                    if entity_type == "media_item":
                        legacy.media_item_id = entity_id
                    count += 1
                else:
                    # Guard against a cross-entity collision: another entity may
                    # already own this (provider, external_id, entity_type) tuple.
                    # This can happen when the same task is redelivered and runs
                    # concurrently (e.g. after a broker restart). Skip the insert
                    # rather than letting the unique constraint violation roll back
                    # the entire session.
                    collision = await session.scalar(
                        select(ExternalID).where(
                            ExternalID.provider == provider,
                            ExternalID.external_id == str_val,
                            ExternalID.entity_type == entity_type,
                        )
                    )
                    if collision is not None:
                        _log.warning(
                            "external_id_cross_entity_collision",
                            provider=provider,
                            external_id=str_val,
                            entity_type=entity_type,
                            existing_entity_id=collision.entity_id,
                            current_entity_id=entity_id,
                        )
                    else:
                        # Use pg_insert ON CONFLICT DO NOTHING to survive
                        # races with concurrent tasks inserting the same row.
                        await session.execute(
                            pg_insert(ExternalID).values(
                                provider=provider,
                                external_id=str_val,
                                entity_type=entity_type,
                                entity_id=entity_id,
                                media_item_id=entity_id if entity_type == "media_item" else None,
                            ).on_conflict_do_nothing(constraint="uq_external_id_provider_ext")
                        )
                        count += 1
        elif existing is not None:
            await session.delete(existing)
            count += 1

    return count


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now(), onupdate=func.now()
    )


# Primary key type — otix_id string with auto-generation.
otix_pk = Annotated[str, mapped_column(String(16), primary_key=True, default=gen_otix_id)]

# Foreign key type — references an otix_id in another table.
otix_fk = Annotated[str, mapped_column(String(16))]
