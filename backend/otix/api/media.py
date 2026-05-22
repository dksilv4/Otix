from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from otix.api.deps import get_current_admin_user, get_db, get_optional_user
from otix.api.schemas.admin_edit import (
    ApproveRejectRequest,
    MediaAssetList,
    MediaAssetOut,
    MediaEditProposalCreate,
    MediaEditProposalList,
    MediaEditProposalOut,
)
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import (
    GenreOut,
    MediaItemDetail,
    MediaItemListResponse,
    MediaItemSummary,
)
from otix.domain.asset import MediaAsset
from otix.domain.genre import Genre
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import MediaItem, UserSteamGame
from otix.domain.user import User
from otix.services.admin_edit_service import AdminEditService
from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService
from otix.tasks.sync.search import BACKFILL_RESULT_THRESHOLD as BACKFILL_THRESHOLD

media_router = APIRouter(prefix="/media", tags=["media"])

SEARCH_CACHE_TTL = 30
EMBEDDING_CACHE_TTL = 300


def _cache_key(q: str, media_type: str | None, sort_by: str | None, page: int, page_size: int) -> str:
    raw = f"{q.lower().strip()}:{media_type or ''}:{sort_by or ''}:{page}:{page_size}"
    return f"search:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


def _embedding_cache_key(q: str) -> str:
    return f"emb:{hashlib.sha256(q.lower().strip().encode()).hexdigest()[:16]}"


async def _embed_query(q: str) -> list[float] | None:
    """Generate an embedding. Checks Redis cache first; on miss, generates
    in background so next search with same query uses the cached value."""
    redis = await get_redis()
    emb_key = _embedding_cache_key(q)
    cached = await redis.get(emb_key)
    if cached:
        return json.loads(cached)

    # Fire generation in background; don't block this request
    async def _generate_and_cache():
        try:
            from otix.services.embedding_service import EmbeddingService

            embedding = await EmbeddingService().embed(q)
            if embedding:
                await redis.set(emb_key, json.dumps(embedding), ex=EMBEDDING_CACHE_TTL)
        except Exception:
            pass

    asyncio.create_task(_generate_and_cache())
    return None


@media_router.get("", response_model=MediaItemListResponse)
async def list_media(
    media_type: str | None = Query(None, description="movie, show, game, or music"),
    genre: str | None = Query(None, description="Genre slug"),
    language: str | None = Query(None, description="Language code (e.g. 'ja', 'ko')"),
    is_anime: bool | None = Query(None, description="Filter to anime (movie/show only)"),
    has_artwork: bool = Query(False, description="Only return items with both textless poster and logo"),
    sort_by: str | None = Query(None, description="popularity, rating, release_date, or title"),
    cursor: str | None = Query(None, description="Pagination cursor (media item id) — cursor mode only"),
    page: int = Query(1, ge=1, description="Page number — sort mode only"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    # Normalize regional language variants
    if language and len(language) > 2:
        language = language.split("-")[0]

    service = MediaService(db)
    items, has_more, total = await service.list_media(
        media_type=media_type,
        genre=genre,
        language=language,
        is_anime=is_anime,
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
    media_type: str | None = Query(None, description="movie, show, game, or music"),
    sort_by: str | None = Query(None, description="relevance, popularity, rating, release_date, title"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    redis = await get_redis()
    cache_key = _cache_key(q, media_type, sort_by, page, page_size)

    # Return cached result when available (skips DB + embedding entirely).
    # Only cache non-authenticated results (user_interactions are skipped).
    if current_user is None:
        cached = await redis.get(cache_key)
        if cached:
            return MediaItemListResponse.model_validate(json.loads(cached))

    # Embed the query for semantic ranking. Uses Redis cache when available;
    # on cold miss, generation fires in background so the next search is fast.
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
        query_hash = _poll_query_hash(q, media_type)
        key = f"backfill:{query_hash}"
        if not await redis.get(key):
            await redis.set(key, "1", ex=300)
            app.send_task("search.backfill", args=[q, media_type])
            backfill_pending = True

    response = MediaItemListResponse(
        items=summaries,
        has_more=has_more,
        total=total,
        backfill_pending=backfill_pending,
    )

    # Cache unauthenticated results so repeated/refined searches skip the DB
    if current_user is None:
        await redis.set(cache_key, response.model_dump_json(), ex=SEARCH_CACHE_TTL)

    return response


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


BACKFILL_POLL_PROVIDERS = ["tmdb_movie", "tmdb_show", "igdb_game", "musicbrainz"]


@media_router.post("/{media_id}/rehydrate")
async def force_rehydrate_media(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    item = await db.scalar(select(MediaItem).where(MediaItem.id == media_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    task_id = str(uuid.uuid4())
    app.send_task(
        "sync.media.rehydrate",
        args=[task_id, media_id],
        queue="user",
        priority=9,
    )
    return {"task_id": task_id}


@media_router.get("/{media_id}/rehydrate/{task_id}/stream")
async def force_rehydrate_media_stream(
    media_id: str,
    task_id: str,
    current_user: User = Depends(get_current_admin_user),
):
    from otix.lib.media_rehydrate_progress import (
        channel_name,
        get_latest_progress,
        get_stored_result,
    )

    stored = await get_stored_result(task_id)
    if stored is not None:
        stored["type"] = "error" if stored.get("error") else "rehydrate_complete"
        payload = json.dumps(stored)

        async def replay():
            yield f"data: {payload}\n\n"

        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    latest = await get_latest_progress(task_id)
    channel = channel_name(task_id)

    async def event_generator():
        if latest is not None:
            yield f"data: {json.dumps(latest)}\n\n"

        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0

                event = json.loads(data)
                if event.get("type") in ("rehydrate_complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@media_router.get("/search/poll", response_model=MediaItemListResponse)
async def poll_search_updates(
    q: str = Query(..., min_length=1, description="Search query"),
    media_type: str | None = Query(None, description="movie, show, game, or music"),
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


# ── Media assets ─────────────────────────────────────────────────


@media_router.get("/{media_id}/assets", response_model=MediaAssetList)
async def list_media_assets(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> MediaAssetList:
    item = await db.scalar(select(MediaItem).where(MediaItem.id == media_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    assets = await db.scalars(
        select(MediaAsset)
        .where(MediaAsset.media_item_id == media_id)
        .order_by(MediaAsset.asset_type, MediaAsset.lang, MediaAsset.score.desc())
    )
    asset_list = list(assets)
    return MediaAssetList(
        items=[MediaAssetOut.model_validate(a) for a in asset_list],
        total=len(asset_list),
    )


# ── Admin edit proposals ────────────────────────────────────────


@media_router.post("/{media_id}/edit-proposals", response_model=MediaEditProposalOut)
async def create_edit_proposal(
    media_id: str,
    body: MediaEditProposalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    item = await db.scalar(select(MediaItem).where(MediaItem.id == media_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    service = AdminEditService(db)
    proposal = await service.create_proposal(
        media_item_id=media_id,
        proposer_user_id=current_user.id,
        changes=body.changes,
        image_overrides=[o.model_dump() for o in body.image_overrides] if body.image_overrides else None,
    )
    return MediaEditProposalOut.model_validate(proposal)


@media_router.get("/{media_id}/edit-proposals", response_model=MediaEditProposalList)
async def list_edit_proposals(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> MediaEditProposalList:
    item = await db.scalar(select(MediaItem).where(MediaItem.id == media_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    service = AdminEditService(db)
    proposals = await service.get_proposals_for_media(media_id)
    return MediaEditProposalList(
        items=[MediaEditProposalOut.model_validate(p) for p in proposals],
        total=len(proposals),
    )


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/approve",
    response_model=MediaEditProposalOut,
)
async def approve_edit_proposal(
    media_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    try:
        proposal = await service.approve_proposal(proposal_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaEditProposalOut.model_validate(proposal)


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/reject",
    response_model=MediaEditProposalOut,
)
async def reject_edit_proposal(
    media_id: str,
    proposal_id: str,
    body: ApproveRejectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    try:
        proposal = await service.reject_proposal(proposal_id, current_user.id, body.rejection_reason)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaEditProposalOut.model_validate(proposal)


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/undo",
    response_model=MediaEditProposalOut,
)
async def undo_approve_edit_proposal(
    media_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> MediaEditProposalOut:
    service = AdminEditService(db)
    try:
        proposal = await service.undo_approval(proposal_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MediaEditProposalOut.model_validate(proposal)


# ── Detail endpoint ──────────────────────────────────────────────


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

        # Look up YouTube video if user has a liked-videos match for this media
        youtube_interaction = await db.scalar(
            select(UserMediaInteraction).where(
                UserMediaInteraction.user_id == current_user.id,
                UserMediaInteraction.media_item_id == media_id,
                UserMediaInteraction.interaction_type == "listened",
                UserMediaInteraction.extra_data["source"].as_string() == "youtube_liked_videos",
            ).limit(1)
        )
        if youtube_interaction and youtube_interaction.extra_data:
            result.youtube_video_id = youtube_interaction.extra_data.get("video_id")
            result.youtube_channel_title = youtube_interaction.extra_data.get("channel_title")

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

        # Apply image overrides for the user's preferred languages
        if current_user is not None:
            edit_service = AdminEditService(db)
            overrides = await edit_service.get_image_overrides_for_media(media_id)
            if overrides:
                preferred = current_user.preferred_languages or []
                for image_type, lang_map in overrides.items():
                    override_url = None
                    # Check each preferred language in order; also check '*' wildcard
                    for lang in preferred:
                        if lang in lang_map:
                            override_url = lang_map[lang]
                            break
                    if override_url is None and "*" in lang_map:
                        override_url = lang_map["*"]
                    if override_url is not None:
                        if image_type == "poster":
                            result.poster_url = override_url
                        elif image_type == "backdrop":
                            result.backdrop_url = override_url
                        elif image_type == "logo":
                            result.logo_url = override_url
                        elif image_type == "textless_poster":
                            result.textless_poster_url = override_url

    return result
