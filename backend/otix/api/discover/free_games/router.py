"""Free games discovery endpoint.

Accepts raw free-game references from the desktop aggregator, matches them
against the Otix catalog via ExternalID, and returns MediaItemDetail results
with free-game metadata attached. Unmatched Epic games with a title are
hydrated from IGDB (seeded into the catalog with full artwork) so they also
land in the user's library.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.domain.media import ExternalID, MediaItem
from otix.infrastructure.redis import get_redis
from otix.schemas.media import MediaItemDetail
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.game_matcher import GameMatcher

router = APIRouter()
logger = structlog.get_logger()


# ── Request schema ─────────────────────────────────────────────────────


class FreeGameRef(BaseModel):
    store: str
    external_id: str  # Steam app ID, Epic namespace:offerId, etc.
    title: str | None = None
    original_price: str | None = None
    free_end_date: str | None = None
    claim_url: str | None = None
    poster_url: str | None = None
    store_label: str | None = None


class FreeGamesMatchRequest(BaseModel):
    games: list[FreeGameRef]


# ── Response schema ────────────────────────────────────────────────────


class FreeGameResult(BaseModel):
    media_item: MediaItemDetail | None = None
    matched: bool = False
    store: str
    store_label: str | None = None
    original_price: str | None = None
    free_end_date: str | None = None
    claim_url: str | None = None
    poster_url: str | None = None
    title: str | None = None
    external_id: str


class FreeGamesMatchResponse(BaseModel):
    items: list[FreeGameResult]


# ── Matching logic ─────────────────────────────────────────────────────


async def _find_media(db: AsyncSession, provider: str, external_id: str) -> MediaItem | None:
    """Look up a MediaItem by an ExternalID mapping."""
    result = await db.execute(
        select(ExternalID)
        .where(
            ExternalID.provider == provider,
            ExternalID.entity_type == "media_item",
            ExternalID.external_id == external_id,
        )
        .limit(1)
    )
    ext = result.scalar_one_or_none()
    if ext is None or not ext.entity_id:
        return None
    return await db.get(MediaItem, ext.entity_id)


async def _match_one(
    db: AsyncSession,
    ref: FreeGameRef,
    matcher: GameMatcher | None = None,
) -> FreeGameResult:
    """Match a single free game ref to an Otix media item.

    Resolution order:
      1. Exact ExternalID lookup (store + external_id)
      2. Epic bare offerId lookup (the aggregator sends "namespace:offerId",
         but earlier seeds store the bare offerId)
      3. Full hydration for unmatched Epic refs (seed from IGDB + SteamGrid)
    """
    media = await _find_media(db, ref.store, ref.external_id)

    if media is None and ref.store == "epic" and ":" in ref.external_id:
        offer_id = ref.external_id.split(":", 1)[1]
        media = await _find_media(db, "epic", offer_id)

    # Unmatched Epic free game → hydrate into the catalog so it lands in the
    # user's library with full IGDB + SteamGrid artwork.
    if media is None and matcher is not None and ref.store == "epic" and ref.title:
        try:
            media_id = await matcher.hydrate_free_game(
                title=ref.title,
                store=ref.store,
                external_id=ref.external_id,
            )
            if media_id:
                media = await db.get(MediaItem, media_id)
        except Exception:
            logger.exception("free game hydration failed", title=ref.title)

    matched = media is not None
    if media is not None:
        await enrich_items_with_assets(db, [media])
        detail = MediaItemDetail.model_validate(media)

    return FreeGameResult(
        media_item=detail if matched else None,
        matched=matched,
        store=ref.store,
        store_label=ref.store_label,
        original_price=ref.original_price,
        free_end_date=ref.free_end_date,
        claim_url=ref.claim_url,
        poster_url=ref.poster_url,
        title=ref.title,
        external_id=ref.external_id,
    )


# ── Endpoint ───────────────────────────────────────────────────────────


@router.post("/free-games/match", response_model=FreeGamesMatchResponse)
async def match_free_games(
    body: FreeGamesMatchRequest,
    db: AsyncSession = Depends(get_db),
) -> FreeGamesMatchResponse:
    """Match free-game references against the Otix catalog.

    Accepts a list of store + external-ID pairs with optional metadata.
    Returns matched MediaItemDetail objects with free-game metadata.
    Unmatched Epic games with a title are hydrated from IGDB (seeded into the
    catalog with full artwork) before being returned.
    """
    if not body.games:
        return FreeGamesMatchResponse(items=[])

    redis = await get_redis()
    from otix.providers.steamgrid.client import SteamGridDBProvider

    matcher = GameMatcher(db, redis, SteamGridDBProvider(redis))

    # Process serially — hydration seeds rows and the async session is
    # single-connection, so concurrent writes would collide.
    items: list[FreeGameResult] = []
    for ref in body.games:
        items.append(await _match_one(db, ref, matcher))

    # Persist games seeded above so the background celery hydration tasks
    # (sync.igdb.game / sync.steamgrid.game_by_name) find them.
    await db.commit()

    return FreeGamesMatchResponse(items=items)
