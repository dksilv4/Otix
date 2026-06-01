from __future__ import annotations

import secrets
from datetime import datetime
from typing import Annotated

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from otix.infrastructure.database import Base


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


async def flush_pending_external_ids(obj, session) -> int:
    """Apply pending external IDs stored by ExternalIDDescriptor.__set__.

    Uses direct DB queries (never accesses _external_ids relationship, which
    has lazy='raise'). Call this after the object is attached and has a PK.

    Returns the number of ExternalID rows created/updated/deleted.
    """
    pending = getattr(obj, "_pending_external_ids", None)
    if not pending:
        return 0

    from sqlalchemy import delete, select

    from otix.domain.media import ExternalID

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
                legacy = await session.scalar(
                    select(ExternalID).where(
                        ExternalID.provider == provider,
                        ExternalID.external_id == str_val,
                        ExternalID.entity_type.is_(None),
                    )
                )
                if legacy is not None:
                    legacy.entity_type = entity_type
                    legacy.entity_id = entity_id
                    count += 1
                else:
                    session.add(ExternalID(
                        provider=provider,
                        external_id=str_val,
                        entity_type=entity_type,
                        entity_id=entity_id,
                    ))
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
