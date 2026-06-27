"""Free games discovery endpoint.

Accepts raw free-game references from the desktop aggregator, matches them
against the Otix catalog via ExternalID, and returns MediaItemDetail results
with free-game metadata attached.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.domain.media import ExternalID, Game, MediaItem
from otix.schemas.media import MediaItemDetail

router = APIRouter()


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


async def _match_one(
    db: AsyncSession,
    ref: FreeGameRef,
) -> FreeGameResult:
    """Match a single free game ref to an Otix media item."""
    # Try exact external ID match
    result = await db.execute(
        select(ExternalID)
        .where(
            ExternalID.provider == ref.store,
            ExternalID.entity_type == "media_item",
            ExternalID.external_id == ref.external_id,
        )
        .limit(1)
    )
    ext = result.scalar_one_or_none()

    if ext is not None:
        # Load full media item
        media_result = await db.execute(select(MediaItem).where(MediaItem.id == ext.entity_id).limit(1))
        media = media_result.scalar_one_or_none()

        if media is not None:
            detail = MediaItemDetail.model_validate(media)
            return FreeGameResult(
                media_item=detail,
                matched=True,
                store=ref.store,
                store_label=ref.store_label,
                original_price=ref.original_price,
                free_end_date=ref.free_end_date,
                claim_url=ref.claim_url,
                poster_url=ref.poster_url,
                title=ref.title,
                external_id=ref.external_id,
            )

    # No match found
    return FreeGameResult(
        media_item=None,
        matched=False,
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
    Unmatched games are included with ``matched=False`` and ``media_item=None``.
    """
    if not body.games:
        return FreeGamesMatchResponse(items=[])

    # Run matches concurrently
    import asyncio

    tasks = [_match_one(db, ref) for ref in body.games]
    items = await asyncio.gather(*tasks)

    return FreeGamesMatchResponse(items=list(items))
