"""ExternalID Service — unified cross-entity identity management.

The Problem
-----------
Otix integrates with 15+ external providers (TMDB, IGDB, Spotify, Steam,
MusicBrainz, Deezer, etc.). Every provider has its own ID system — TMDB has
movie/show/person IDs, IGDB has game IDs, Spotify has track/album IDs. We need
a single table that maps any external ID to any internal entity, so we can:

- Resolve "TMDB movie 550" → our MediaItem.id
- Resolve "Spotify track 6f8Fg6aG" → our Track.id
- Resolve "IGDB company 123" → our Company.id
- Find all external IDs for a given entity (e.g., a MusicBrainz release)

Design
------
One table, polymorphic references::

    external_ids
      id              PK (otix_pk, String(16))
      provider        e.g. "tmdb", "spotify", "igdb", "steam", "musicbrainz"
      external_id     the provider's native ID (String(100))
      entity_type     what kind of thing: "media_item", "person", "track",
                      "company", "platform", "franchise", "collection",
                      "keyword", "watch_provider"
      entity_id       PK of the entity in its table (String(16))
      content_hash    SHA-256 of last-seen raw data (for change detection)
      hash_match_count  how many times content_hash stayed the same

    UNIQUE (provider, external_id)
    INDEX  (entity_type, entity_id)

The UNIQUE constraint means each provider+external_id pair maps to exactly one
entity. If a Steam game and an IGDB game refer to the same title, they get
separate rows (different providers) that point to the same entity_id.

The old ``media_item_id`` and ``media_type`` columns still exist on the table
but are deprecated. All new code MUST set ``entity_type`` and ``entity_id``
instead. The ORM relationship ``ExternalID.media_item`` uses a viewonly
primaryjoin on ``entity_type == 'media_item'`` for backward compatibility.

Entity Types
------------
Each domain model declares its entity type via ``__external_id_entity_type__``:

============== ====================================
Entity Type    Domain Model
============== ====================================
media_item     MediaItem (movies, shows, games, music)
person         Person (cast, crew, artists)
track          Track (music tracks)
company        Company (production companies, publishers)
platform       Platform (gaming platforms)
franchise      Franchise (cross-media IP)
collection     Collection (TMDB movie collections)
keyword        Keyword (TMDB keywords)
watch_provider WatchProvider (streaming services)
============== ====================================

Descriptor Pattern
------------------
Models can use ``ExternalIDDescriptor`` to expose external IDs as typed
attribute accessors::

    class Game(Base, HasExternalIDs):
        __external_id_entity_type__ = "media_item"

        steam_app_id = ExternalIDDescriptor("steam", cast_type=int)

    game.steam_app_id = 730        # creates ExternalID(provider="steam", external_id="730", entity_type="media_item", entity_id=game.id)
    print(game.steam_app_id)      # → 730

ExternalIDDescriptor handles flush-time upsert via the before_flush event, so
you can assign IDs to detached objects and they'll be persisted on flush.

Service Methods
---------------
All ExternalID CRUD should go through ExternalIDService. Never construct
ExternalID() directly or call session.add(ExternalID(...)).

``upsert(provider, external_id, entity_type, entity_id)``
    Idempotent create-or-update. Uses PostgreSQL ON CONFLICT DO UPDATE on
    (provider, external_id). Returns the ExternalID row.

``get_by_provider_ext_id(provider, external_id)``
    Look up a single row by the natural key. Returns ExternalID or None.

``find_entity_id(provider, external_id)``
    Convenience — returns just the entity_id string or None.

``find_entity_id_by_type(provider, external_id, entity_type)``
    Like find_entity_id but also filters by entity_type (for cases where
    the same provider+external_id could map to different entity types).

``batch_find_entity_ids(provider, external_ids)``
    Bulk lookup: {external_id: entity_id} for a list of external IDs from
    a single provider.

``batch_find_by_entity_ids(entity_type, entity_ids)``
    Reverse lookup: {entity_id: [(provider, external_id), ...]} for a list
    of entity IDs.

``delete(entity_type, entity_id, provider)``
    Remove a specific external ID mapping. Returns True if deleted.

Migration Guide
---------------
**Before (deprecated):**::

    ext_id = ExternalID(provider="igdb", external_id="123", media_item_id=item.id)
    session.add(ext_id)

**After (correct):**::

    svc = ExternalIDService(session)
    ext_id = await svc.upsert("igdb", "123", "media_item", item.id)

**Before (deprecated) — reading:** ``ext_id.media_item_id``
**After (correct) — reading:**     ``ext_id.entity_id``
"""

from __future__ import annotations

from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID


class ExternalIDService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_provider_ext_id(
        self, provider: str, external_id: str, entity_type: str | None = None,
    ) -> ExternalID | None:
        clauses = [
            ExternalID.provider == provider,
            ExternalID.external_id == external_id,
        ]
        if entity_type is not None:
            clauses.append(ExternalID.entity_type == entity_type)
        return await self._session.scalar(select(ExternalID).where(*clauses))

    async def find_entity_id(
        self, provider: str, external_id: str, entity_type: str | None = None,
    ) -> str | None:
        row = await self.get_by_provider_ext_id(provider, external_id, entity_type)
        return row.entity_id if row is not None else None

    async def find_entity_id_by_type(
        self, provider: str, external_id: str, entity_type: str
    ) -> str | None:
        row = await self._session.scalar(
            select(ExternalID).where(
                ExternalID.provider == provider,
                ExternalID.external_id == external_id,
                ExternalID.entity_type == entity_type,
            )
        )
        return row.entity_id if row is not None else None

    async def batch_find_entity_ids(
        self, provider: str, external_ids: list[str]
    ) -> dict[str, str]:
        rows = await self._session.scalars(
            select(ExternalID).where(
                ExternalID.provider == provider,
                ExternalID.external_id.in_(external_ids),
            )
        )
        return {row.external_id: row.entity_id for row in rows if row.entity_id}

    async def batch_find_by_entity_ids(
        self, entity_type: str, entity_ids: list[str]
    ) -> dict[str, list[tuple[str, str]]]:
        rows = await self._session.scalars(
            select(ExternalID).where(
                ExternalID.entity_type == entity_type,
                ExternalID.entity_id.in_(entity_ids),
            )
        )
        result: dict[str, list[tuple[str, str]]] = {}
        for row in rows:
            if row.entity_id:
                result.setdefault(row.entity_id, []).append(
                    (row.provider, row.external_id)
                )
        return result

    async def upsert(
        self,
        provider: str,
        external_id: str,
        entity_type: str,
        entity_id: str,
    ) -> ExternalID:
        set_values = {"entity_type": entity_type, "entity_id": entity_id}
        insert_values = {
            "provider": provider,
            "external_id": external_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
        }
        if entity_type == "media_item":
            insert_values["media_item_id"] = entity_id
            set_values["media_item_id"] = entity_id

        stmt = (
            pg_insert(ExternalID)
            .values(**insert_values)
            .on_conflict_do_update(
                index_elements=["provider", "external_id", "entity_type"],
                set_=set_values,
            )
            .returning(ExternalID)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def delete(
        self, entity_type: str, entity_id: str, provider: str
    ) -> bool:
        result = await self._session.execute(
            sa_delete(ExternalID).where(
                ExternalID.entity_type == entity_type,
                ExternalID.entity_id == entity_id,
                ExternalID.provider == provider,
            )
        )
        return result.rowcount > 0
