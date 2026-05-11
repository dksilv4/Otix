from __future__ import annotations

import hashlib
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from otix.api.deps import get_db, get_optional_user
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import (
    GenreOut,
    MediaItemDetail,
    MediaItemListResponse,
    MediaItemSummary,
)
from otix.domain.genre import Genre
from otix.domain.media import UserSteamGame
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService
from otix.tasks.sync import BACKFILL_RESULT_THRESHOLD as BACKFILL_THRESHOLD

media_router = APIRouter(prefix="/media", tags=["media"])


async def _embed_query(query: str) -> list[float] | None:
    """Generate an embedding for a search query. Returns None on any failure
    (e.g. model not yet downloaded, or embedding disabled)."""
    try:
        from otix.services.embedding_service import EmbeddingService

        return await EmbeddingService().embed(query)
    except Exception:
        return None


@media_router.get("", response_model=MediaItemListResponse)
async def list_media(
    media_type: str | None = Query(None, description="movie, show, or game"),
    genre: str | None = Query(None, description="Genre slug"),
    has_artwork: bool = Query(False, description="Only return items with both textless poster and logo"),
    sort_by: str | None = Query(None, description="popularity, rating, release_date, or title"),
    cursor: str | None = Query(None, description="Pagination cursor (media item id) — cursor mode only"),
    page: int = Query(1, ge=1, description="Page number — sort mode only"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    service = MediaService(db)
    items, has_more, total = await service.list_media(
        media_type=media_type,
        genre=genre,
        has_artwork=has_artwork,
        sort_by=sort_by,
        cursor=cursor,
        page=page,
        limit=limit,
        include_total=True,
    )

    next_cursor = items[-1].id if has_more and items else None

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
        total=total,
    )


@media_router.get("/genres", response_model=list[GenreOut])
async def list_genres(
    media_type: str | None = Query(None, description="Filter genres to a specific media type"),
    db: AsyncSession = Depends(get_db),
) -> list[GenreOut]:
    query = select(Genre).order_by(Genre.name)
    if media_type:
        from otix.domain.genre import MediaGenre
        from otix.domain.media import MediaItem
        query = (
            select(Genre)
            .distinct()
            .join(MediaGenre, MediaGenre.genre_id == Genre.id)
            .join(MediaItem, MediaItem.id == MediaGenre.media_item_id)
            .where(MediaItem.media_type == media_type)
            .order_by(Genre.name)
        )
    result = await db.scalars(query)
    return [GenreOut.model_validate(g) for g in result]


@media_router.get("/search", response_model=MediaItemListResponse)
async def search_media(
    q: str = Query(..., min_length=1, description="Search query"),
    media_type: str | None = Query(None, description="movie, show, or game"),
    sort_by: str | None = Query(None, description="relevance, popularity, rating, release_date, title"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    # Embed the query for semantic ranking. Failures are non-blocking:
    # search degrades gracefully to FTS + trigram only.
    query_embedding = await _embed_query(q)

    service = MediaService(db)
    items, total = await service.search_media(
        query_str=q,
        media_type=media_type,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
        query_embedding=query_embedding,
    )

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    has_more = (page * page_size) < total

    # Fire-and-forget backfill only when local results are sparse.
    # Dedup via Redis: same query within 5 min won't re-trigger.
    # Skip backfill for queries that are too short, purely numeric, or look
    # like gibberish (random char mix with no alphabetic core).
    backfill_pending = False
    if page == 1 and total < BACKFILL_THRESHOLD and _should_backfill(q):
        redis = await get_redis()
        query_hash = _poll_query_hash(q, media_type)
        key = f"backfill:{query_hash}"
        if not await redis.get(key):
            await redis.set(key, "1", ex=300)
            app.send_task("search.backfill", args=[q, media_type])
            backfill_pending = True

    return MediaItemListResponse(
        items=summaries,
        has_more=has_more,
        total=total,
        backfill_pending=backfill_pending,
    )


def _should_backfill(q: str) -> bool:
    """Return False for queries that aren't worth backfilling.

    Filters out:
      - Less than 2 characters (with whitespace trimmed)
      - Purely numeric queries
      - Gibberish: 4+ consecutive consonants with no vowels in between
    """
    stripped = q.strip()
    if len(stripped) < 2:
        return False
    if stripped.isdigit():
        return False
    # Gibberish check: 4+ consecutive non-vowel, non-space characters
    if re.search(r"[^aeiou\s]{4,}", stripped, re.IGNORECASE):
        return False
    return True


def _poll_query_hash(q: str, media_type: str | None) -> str:
    raw = f"{q.lower().strip()}:{media_type or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


BACKFILL_POLL_PROVIDERS = ["tmdb_movie", "tmdb_show", "igdb_game"]


@media_router.get("/search/poll", response_model=MediaItemListResponse)
async def poll_search_updates(
    q: str = Query(..., min_length=1, description="Search query"),
    media_type: str | None = Query(None, description="movie, show, or game"),
    known_ids: str = Query("", description="Comma-separated list of known item IDs"),
    page_size: int = Query(24, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    """Poll for new search results added by backfill.

    Re-runs the search and returns items not already in `known_ids`.
    Also reports whether backfill is still in progress via `backfill_pending`.
    """
    service = MediaService(db)
    items, total = await service.search_media(
        query_str=q,
        media_type=media_type,
        page=1,
        page_size=page_size,
    )

    known = set(known_ids.split(",")) if known_ids else set()
    new_items = [item for item in items if str(item.id) not in known]

    summaries = [MediaItemSummary.model_validate(item) for item in new_items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    # Check if any backfill providers are still running
    query_hash = _poll_query_hash(q, media_type)
    redis = await get_redis()
    all_done = True
    for provider in BACKFILL_POLL_PROVIDERS:
        val = await redis.get(f"backfill:{query_hash}:{provider}")
        if val is None:
            all_done = False
            break

    return MediaItemListResponse(
        items=summaries,
        has_more=False,
        total=total,
        backfill_pending=not all_done,
    )


@media_router.get("/{media_id}", response_model=MediaItemDetail)
async def get_media_item(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemDetail:
    service = MediaService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    result = MediaItemDetail.model_validate(item)

    if current_user is not None:
        interaction_service = InteractionService(db)
        state = await interaction_service.get_user_interactions(
            user_id=current_user.id, media_item_id=media_id,
        )
        result.user_interactions = UserInteractionState(**state)

        # Load Steam playtime if the game has a steam_app_id
        if item.game and item.game.steam_app_id:
            steam_game = await db.scalar(
                select(UserSteamGame).where(
                    UserSteamGame.user_id == current_user.id,
                    UserSteamGame.steam_app_id == item.game.steam_app_id,
                )
            )
            if steam_game:
                result.steam_playtime_forever = steam_game.playtime_forever
                result.steam_playtime_2weeks = steam_game.playtime_2weeks
                result.steam_rtime_last_played = steam_game.rtime_last_played

    return result
