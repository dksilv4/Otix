from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select, update
from sqlalchemy.orm import joinedload

from otix.api.deps import get_current_admin_user, get_db, get_optional_user, get_trusted_or_admin_user, resolve_country_code
from otix.api.schemas.admin_edit import (
    ApproveRejectRequest,
    MediaAssetList,
    MediaAssetOut,
    MediaEditProposalCreate,
    MediaEditProposalList,
    MediaEditProposalOut,
    ProposalVoteCreate,
    VoteResponse,
)
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import (
    CompanyOut,
    GenreOut,
    MediaItemDetail,
    MediaItemListResponse,
    MediaItemSummary,
    MediaWatchProviderOut,
    TrackSearchResult,
    WatchProviderOut,
)
from otix.domain.asset import MediaAsset
from otix.domain.genre import Genre
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import ExternalID, MediaItem, UserPlexItem, UserSteamGame
from otix.domain.watch_provider import MediaWatchProvider
from otix.domain.user import User
from otix.services.admin_edit_service import AdminEditService
from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult
from otix.tasks.sync.search import BACKFILL_RESULT_THRESHOLD as BACKFILL_THRESHOLD

media_router = APIRouter(prefix="/media", tags=["media"])

SEARCH_CACHE_TTL = 30

logger = structlog.get_logger()
EMBEDDING_CACHE_TTL = 300


def _cache_key(q: str, media_type: str | None, sort_by: str | None, page: int, page_size: int, exclude_adult: bool = True) -> str:
    raw = f"{q.lower().strip()}:{media_type or ''}:{sort_by or ''}:{page}:{page_size}:adult{0 if exclude_adult else 1}"
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

            embedding = await EmbeddingService().embed(q, purpose="query")
            if embedding:
                await redis.set(emb_key, json.dumps(embedding), ex=EMBEDDING_CACHE_TTL)
        except Exception:
            pass

    asyncio.create_task(_generate_and_cache())
    return None


async def _increment_view_count(media_id: str) -> None:
    """Fire-and-forget view count increment using a fresh session."""
    from otix.infrastructure.database import async_session

    try:
        async with async_session() as session:
            await session.execute(
                update(MediaItem)
                .where(MediaItem.id == media_id)
                .values(view_count=MediaItem.view_count + 1)
            )
            await session.commit()
    except Exception:
        pass


async def _fetch_steam_playtime(db: AsyncSession, user_id: str, media_id: str) -> dict | None:
    """Fetch Steam playtime in a single query (joins ExternalID + UserSteamGame)."""
    from sqlalchemy import Integer as SAInteger, func as safunc

    steam_game = await db.scalar(
        select(UserSteamGame).where(
            UserSteamGame.user_id == user_id,
            UserSteamGame.steam_app_id == safunc.cast(
                select(ExternalID.external_id).where(
                    ExternalID.provider == "steam",
                    ExternalID.entity_type == "media_item",
                    ExternalID.entity_id == media_id,
                ).scalar_subquery(),
                SAInteger,
            ),
        )
    )
    if steam_game is None:
        return None
    return {
        "playtime_forever": steam_game.playtime_forever,
        "playtime_2weeks": steam_game.playtime_2weeks,
        "rtime_last_played": steam_game.rtime_last_played,
    }


async def _log_search(
    q: str,
    media_type: str | None,
    sort_by: str | None,
    page: int,
    page_size: int,
    result_count: int | None,
    items_returned: int,
    tracks_returned: int,
    backfill_triggered: bool,
    cache_hit: bool,
    query_embedding_available: bool | None,
    user_id: str | None,
    is_bot: bool,
) -> None:
    """Fire-and-forget: write a search event to search_logs."""
    from otix.domain.search_log import SearchLog
    from otix.infrastructure.database import async_session

    try:
        async with async_session() as session:
            log = SearchLog(
                query=q[:500],
                media_type=media_type,
                sort_by=sort_by,
                page=page,
                page_size=page_size,
                result_count=result_count,
                items_returned=items_returned,
                tracks_returned=tracks_returned,
                backfill_triggered=backfill_triggered,
                cache_hit=cache_hit,
                query_embedding_available=query_embedding_available,
                user_id=user_id,
                is_bot=is_bot,
            )
            session.add(log)
            await session.commit()
    except Exception:
        logger.warning("search_log_failed", exc_info=True)


@media_router.get("", response_model=MediaItemListResponse)
async def list_media(
    request: Request,
    media_type: str | None = Query(None, description="movie, show, game, or music"),
    genre: str | None = Query(None, description="Genre slug"),
    company: str | None = Query(None, description="Company ID"),
    language: str | None = Query(None, description="Language code (e.g. 'ja', 'ko')"),
    is_anime: bool | None = Query(None, description="Filter to anime (movie/show only)"),
    has_artwork: bool = Query(False, description="Only return items with both textless poster and logo"),
    sort_by: str | None = Query(None, description="popularity, rating, release_date, title, revenue, budget, or profit"),
    sort_dir: str | None = Query(None, description="Sort direction: asc or desc (default desc)"),
    certification: str | None = Query(None, description="Filter by certification in the user's country (e.g. 'PG-13', 'R', 'TV-MA')"),
    cursor: str | None = Query(None, description="Pagination cursor (media item id) — cursor mode only"),
    page: int = Query(1, ge=1, description="Page number — sort mode only"),
    limit: int = Query(50, ge=1, le=100),
    person_id: str | None = Query(None, description="Filter by person credit ID"),
    credit_role: str | None = Query(None, description="Credit role filter (default 'primary' when person_id is set)"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    # Normalize regional language variants
    if language and len(language) > 2:
        language = language.split("-")[0]

    exclude_adult = should_exclude_adult(current_user)
    country_code = await resolve_country_code(request, current_user)

    service = MediaService(db)
    items, has_more, total = await service.list_media(
        media_type=media_type,
        genre=genre,
        company=company,
        language=language,
        is_anime=is_anime,
        has_artwork=has_artwork,
        sort_by=sort_by,
        sort_dir=sort_dir or "desc",
        cursor=cursor,
        page=page,
        limit=limit,
        include_total=True,
        exclude_adult=exclude_adult,
        certification=certification,
        country_code=country_code,
        person_id=person_id,
        credit_role=credit_role,
    )

    next_cursor = items[-1].id if has_more and items else None

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    # Carry movie financials onto summaries only when sorting by financial fields
    if sort_by in ("revenue", "budget", "profit"):
        for i, summary in enumerate(summaries):
            movie = items[i].movie if items[i].movie else None
            if movie:
                summary.revenue = movie.revenue
                summary.budget = movie.budget

    # Carry album release group id for music dedup and load user interactions
    # — these are independent, launch them concurrently.
    rg_future = None
    interactions_future = None

    if media_type == 'music':
        album_media_ids = [item.id for item in items if item.album]
        if album_media_ids:
            rg_future = asyncio.ensure_future(
                db.execute(
                    select(ExternalID.external_id, ExternalID.entity_id).where(
                        ExternalID.provider == "musicbrainz_release_group",
                        ExternalID.entity_type == "media_item",
                        ExternalID.entity_id.in_(album_media_ids),
                    )
                )
            )

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        interactions_future = asyncio.ensure_future(
            interaction_service.get_batch_interactions(
                user_id=current_user.id,
                media_item_ids=[s.id for s in summaries],
            )
        )

    # Resolve release group map
    if media_type == 'music':
        rg_map: dict[str, str] = {}
        if rg_future is not None:
            eid_result = await rg_future
            rg_map = {row.entity_id: row.external_id for row in eid_result if row.entity_id and row.external_id}
        for i, summary in enumerate(summaries):
            album = items[i].album
            if album:
                summary.album_musicbrainz_release_group_id = rg_map.get(album.media_item_id)

    # Resolve interactions
    if interactions_future is not None:
        batch = await interactions_future
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


@media_router.get("/company", response_model=CompanyOut)
async def get_company_by_slug(
    slug: str = Query(None, description="Company slug (deprecated, use /company/{id})"),
    id: str = Query(None, description="Company ID"),
    db: AsyncSession = Depends(get_db),
) -> CompanyOut:
    from otix.domain.company import Company
    if id:
        result = await db.scalar(select(Company).where(Company.id == id))
    elif slug:
        result = await db.scalar(select(Company).where(Company.slug == slug))
    else:
        raise HTTPException(status_code=400, detail="Provide id or slug")
    if not result:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyOut.model_validate(result)


@media_router.get("/certifications", response_model=list[str])
async def list_certifications(
    media_type: str | None = Query(None, description="Filter certifications to a specific media type"),
    country_code: str = Query("us", description="Country code for certification ratings (e.g. 'us', 'gb')"),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    from otix.domain.asset import MediaRelease

    query = (
        select(MediaRelease.certification)
        .distinct()
        .join(MediaItem, MediaItem.id == MediaRelease.media_item_id)
        .where(
            MediaRelease.country_code == country_code.lower(),
            MediaRelease.certification.isnot(None),
            MediaRelease.certification != "",
        )
        .order_by(MediaRelease.certification)
    )
    if media_type:
        query = query.where(MediaItem.media_type == media_type)
    result = await db.scalars(query)
    return list(result)


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
    exclude_adult = should_exclude_adult(current_user)
    redis = await get_redis()
    cache_key = _cache_key(q, media_type, sort_by, page, page_size, exclude_adult)

    # Cache hit: serve cached response (shared across all users, no interactions).
    cached = await redis.get(cache_key)
    if cached:
        cached_response = MediaItemListResponse.model_validate(json.loads(cached))
        # Patch fresh interactions for authenticated users
        if current_user is not None and cached_response.items:
            interaction_service = InteractionService(db)
            batch = await interaction_service.get_batch_interactions(
                user_id=current_user.id,
                media_item_ids=[s.id for s in cached_response.items],
            )
            for summary in cached_response.items:
                state = batch.get(summary.id, {})
                summary.user_interactions = UserInteractionState(**state)
        asyncio.create_task(_log_search(
            q=q,
            media_type=media_type,
            sort_by=sort_by,
            page=page,
            page_size=page_size,
            result_count=cached_response.total,
            items_returned=len(cached_response.items),
            tracks_returned=len(cached_response.tracks),
            backfill_triggered=cached_response.backfill_pending,
            cache_hit=True,
            query_embedding_available=None,
            user_id=current_user.id if current_user else None,
            is_bot=current_user.is_bot if current_user else False,
        ))
        return cached_response

    # Cold path: full search + embed
    query_embedding = await _embed_query(q)

    service = MediaService(db)

    # Launch main search, then track search on a separate session so they
    # run concurrently without sharing an AsyncSession (which is not safe
    # for concurrent use).
    search_future = asyncio.ensure_future(
        service.search_media(
            query_str=q,
            media_type=media_type,
            sort_by=sort_by,
            page=page,
            page_size=page_size,
            query_embedding=query_embedding,
            exclude_adult=exclude_adult,
        )
    )
    if page == 1 and (media_type is None or media_type == "music"):
        async def _search_tracks_with_fresh_session() -> list:
            from otix.infrastructure.database import async_session
            async with async_session() as tracks_session:
                tracks_service = MediaService(tracks_session)
                return await tracks_service.search_tracks(query_str=q, limit=20)
        tracks_future: asyncio.Task[list] | None = asyncio.ensure_future(
            _search_tracks_with_fresh_session()
        )
    else:
        tracks_future = None

    items, total, has_more = await search_future

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    # Process track search results (was running concurrently with main search)
    track_summaries: list[TrackSearchResult] = []
    if tracks_future is not None:
        tracks = await tracks_future

        # Batch-load Track spotify_ids from ExternalID table
        # (Track.spotify_id is a descriptor, not a real column)
        track_ids = [t.id for t in tracks]
        spotify_id_map: dict[str, str] = {}
        if track_ids:
            eid_result = await db.execute(
                select(ExternalID.entity_id, ExternalID.external_id).where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.entity_id.in_(track_ids),
                )
            )
            spotify_id_map = {row.entity_id: row.external_id for row in eid_result if row.entity_id and row.external_id}

        for t in tracks:
            album_item = t.album.media_item
            artist_name = None
            if album_item.credits:
                artist_credit = next(
                    (c for c in album_item.credits if c.role in ("artist", "primary") and c.person),
                    album_item.credits[0] if album_item.credits[0].person else None,
                )
                if artist_credit and artist_credit.person:
                    artist_name = artist_credit.person.name
            track_summaries.append(
                TrackSearchResult(
                    id=t.id,
                    title=t.title,
                    track_number=t.track_number,
                    disc_number=t.disc_number,
                    duration_ms=t.duration_ms,
                    preview_url=t.preview_url,
                    spotify_id=spotify_id_map.get(t.id),
                    avg_rating=t.avg_rating,
                    rating_count=t.rating_count,
                    album_id=t.album.media_item_id,
                    album_title=album_item.title,
                    album_poster_url=album_item.poster_url,
                    album_artist_name=artist_name,
                    album_slug=album_item.slug,
                )
            )

    # Fire-and-forget backfill only when local results are sparse.
    # Dedup via Redis: same query within 5 min won't re-trigger.
    backfill_pending = False
    if page == 1 and total < BACKFILL_THRESHOLD and _should_backfill(q):
        query_hash = _poll_query_hash(q, media_type)
        key = f"backfill:{query_hash}"
        if not await redis.get(key):
            await redis.set(key, "1", ex=300)
            app.send_task("search.backfill", args=[q, media_type])
            backfill_pending = True

    # Build response without interactions and cache it (shared across all users).
    response = MediaItemListResponse(
        items=summaries,
        tracks=track_summaries,
        has_more=has_more,
        total=total,
        backfill_pending=backfill_pending,
    )
    await redis.set(cache_key, response.model_dump_json(), ex=SEARCH_CACHE_TTL)

    # Fire-and-forget search analytics
    asyncio.create_task(_log_search(
        q=q,
        media_type=media_type,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
        result_count=total,
        items_returned=len(summaries),
        tracks_returned=len(track_summaries),
        backfill_triggered=backfill_pending,
        cache_hit=False,
        query_embedding_available=query_embedding is not None,
        user_id=current_user.id if current_user else None,
        is_bot=current_user.is_bot if current_user else False,
    ))

    # Patch fresh interactions for authenticated users before returning
    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

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
        queue="reactive-user",
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
    exclude_adult = should_exclude_adult(current_user)
    query_embedding = await _embed_query(q)
    service = MediaService(db)
    items, total, has_more = await service.search_media(
        query_str=q,
        media_type=media_type,
        page=1,
        page_size=page_size,
        query_embedding=query_embedding,
        exclude_adult=exclude_adult,
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

    # Check if any backfill providers are still running (single mget)
    query_hash = _poll_query_hash(q, media_type)
    redis = await get_redis()
    keys = [f"backfill:{query_hash}:{p}" for p in BACKFILL_POLL_PROVIDERS]
    vals = await redis.mget(keys)
    all_done = all(v is not None for v in vals)

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
    current_user: User = Depends(get_trusted_or_admin_user),
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
    current_user: User = Depends(get_trusted_or_admin_user),
) -> MediaEditProposalList:
    item = await db.scalar(select(MediaItem).where(MediaItem.id == media_id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    service = AdminEditService(db)
    proposals = await service.get_proposals_for_media(media_id)
    vote_map = await service.get_user_votes_for_proposals(
        current_user.id, [p.id for p in proposals]
    ) if proposals else {}
    items = []
    for p in proposals:
        out = MediaEditProposalOut.model_validate(p)
        out.my_vote = vote_map.get(p.id)
        items.append(out)
    return MediaEditProposalList(items=items, total=len(proposals))


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


# ── Proposal voting ──────────────────────────────────────────────


@media_router.post(
    "/{media_id}/edit-proposals/{proposal_id}/vote",
    response_model=VoteResponse,
)
async def vote_on_proposal(
    media_id: str,
    proposal_id: str,
    body: ProposalVoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> VoteResponse:
    service = AdminEditService(db)
    try:
        result = await service.vote(proposal_id, current_user.id, body.vote_type)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    proposal = await service.get_proposal(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    return VoteResponse(
        my_vote=result,
        upvote_count=proposal.upvote_count,
        downvote_count=proposal.downvote_count,
    )


@media_router.delete(
    "/{media_id}/edit-proposals/{proposal_id}/vote",
    status_code=204,
)
async def remove_proposal_vote(
    media_id: str,
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> None:
    service = AdminEditService(db)
    deleted = await service.remove_vote(proposal_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")


# ── Similar items ────────────────────────────────────────────────


_SIMILAR_TTL = 60


@media_router.get("/{media_id}/similar", response_model=MediaItemListResponse)
async def get_similar_media(
    media_id: str,
    media_type: str | None = Query(None, description="Filter similar items to a specific media type"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"media:similar:{media_id}:{media_type or ''}:{limit}:adult{0 if exclude_adult else 1}"
    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        cached_response = MediaItemListResponse.model_validate(json.loads(cached))
        if current_user is not None and cached_response.items:
            interaction_service = InteractionService(db)
            batch = await interaction_service.get_batch_interactions(
                user_id=current_user.id,
                media_item_ids=[s.id for s in cached_response.items],
            )
            for summary in cached_response.items:
                state = batch.get(summary.id, {})
                summary.user_interactions = UserInteractionState(**state)
        return cached_response

    service = MediaService(db)
    items = await service.similar_media(
        media_id=media_id,
        media_type=media_type,
        limit=limit,
        exclude_adult=exclude_adult,
    )

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    response = MediaItemListResponse(
        items=summaries,
        has_more=False,
        total=len(summaries),
    )
    # Cache without interactions (shared across all users)
    await redis.set(cache_key, response.model_dump_json(), ex=_SIMILAR_TTL)

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return response


# ── Recommendations ──────────────────────────────────────────────


_RECOMMENDATIONS_TTL = 60


@media_router.get("/{media_id}/recommendations", response_model=MediaItemListResponse)
async def get_recommendations(
    media_id: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    service = MediaService(db)

    # Look up media_type from the source item (lightweight query).
    item_media_type = await db.scalar(
        select(MediaItem.media_type).where(MediaItem.id == media_id)
    )
    if item_media_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    # Try personalized recommendations (per-user, not cacheable)
    seed_ids: list[str] = []
    if current_user:
        from otix.services.personalization_service import PersonalizationService
        personalization = PersonalizationService(db)
        seed_ids = await personalization.get_semantic_recommendations(
            current_user.id,
            item_media_type,
            limit=limit,
            exclude_adult=exclude_adult,
            exclude_media_id=media_id,
        )

    personalized = bool(seed_ids)

    # Fallback path: content-based similar (globally cacheable).
    if not personalized:
        fallback_cache_key = f"media:recs_fallback:{media_id}:{item_media_type}:{limit}:adult{0 if exclude_adult else 1}"
        redis = await get_redis()
        cached = await redis.get(fallback_cache_key)
        if cached:
            cached_response = MediaItemListResponse.model_validate(json.loads(cached))
            if current_user is not None and cached_response.items:
                interaction_service = InteractionService(db)
                batch = await interaction_service.get_batch_interactions(
                    user_id=current_user.id,
                    media_item_ids=[s.id for s in cached_response.items],
                )
                for summary in cached_response.items:
                    state = batch.get(summary.id, {})
                    summary.user_interactions = UserInteractionState(**state)
            return cached_response

    # Fetch items
    if seed_ids:
        # Fetch in KNN order (get_media_items_by_ids preserves input order);
        # list_media would re-sort by popularity and destroy semantic relevance.
        items = await service.get_media_items_by_ids(seed_ids[:limit])
    else:
        items = await service.similar_media(
            media_id=media_id,
            media_type=item_media_type,
            limit=limit,
            exclude_adult=exclude_adult,
        )

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    response = MediaItemListResponse(
        items=summaries,
        has_more=False,
        total=len(summaries),
    )

    # Cache fallback globally; personalized results are not cached
    if not personalized:
        await redis.set(fallback_cache_key, response.model_dump_json(), ex=_RECOMMENDATIONS_TTL)

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return response


# ── Detail endpoint ──────────────────────────────────────────────


_MEDIA_DETAIL_TTL = 30


def _media_cache_key(media_id: str, country_code: str) -> str:
    return f"media:detail:{media_id}:{country_code}"


async def _patch_user_detail(
    result: MediaItemDetail,
    db: AsyncSession,
    current_user: User,
    media_id: str,
) -> None:
    """Load and apply user-specific fields onto a cached/public MediaItemDetail."""
    interaction_service = InteractionService(db)

    # Launch all independent user-specific lookups concurrently
    interactions_future = asyncio.ensure_future(
        interaction_service.get_user_interactions(current_user.id, media_id)
    )
    youtube_future = asyncio.ensure_future(
        db.scalar(
            select(UserMediaInteraction).where(
                UserMediaInteraction.user_id == current_user.id,
                UserMediaInteraction.media_item_id == media_id,
                UserMediaInteraction.interaction_type == "listened",
                UserMediaInteraction.extra_data["source"].as_string() == "youtube_liked_videos",
            ).limit(1)
        )
    )
    steam_future: asyncio.Task | None = None
    if result.game:
        steam_future = asyncio.ensure_future(
            _fetch_steam_playtime(db, current_user.id, media_id)
        )
    overrides_future = asyncio.ensure_future(
        AdminEditService(db).get_image_overrides_for_media(media_id)
    )
    plex_future = asyncio.ensure_future(
        db.scalar(
            select(UserPlexItem).where(
                UserPlexItem.user_id == current_user.id,
                UserPlexItem.media_item_id == media_id,
            ).limit(1)
        )
    )

    futures: list[asyncio.Task] = [interactions_future, youtube_future, overrides_future, plex_future]
    if steam_future:
        futures.append(steam_future)
    gathered = await asyncio.gather(*futures)

    state = gathered[0]
    youtube_interaction = gathered[1]
    overrides = gathered[2]
    plex_item = gathered[3]
    steam_data = gathered[4] if steam_future else None

    result.user_interactions = UserInteractionState(**state)

    # Apply YouTube match
    if youtube_interaction and youtube_interaction.extra_data:
        result.youtube_video_id = youtube_interaction.extra_data.get("video_id")
        result.youtube_channel_title = youtube_interaction.extra_data.get("channel_title")

    # Apply Steam playtime
    if steam_data:
        result.steam_playtime_forever = steam_data["playtime_forever"]
        result.steam_playtime_2weeks = steam_data["playtime_2weeks"]
        result.steam_rtime_last_played = steam_data["rtime_last_played"]

    # Apply image overrides for the user's preferred languages
    if overrides:
        preferred = current_user.preferred_languages or []
        for image_type, lang_map in overrides.items():
            override_url = None
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

    # Plex watch provider
    if plex_item is not None:
        result.watch_providers.append(MediaWatchProviderOut(
            id=f"plex-{media_id}",
            watch_provider=WatchProviderOut(
                id="plex",
                name="Plex",
                slug="plex",
                logo_url=None,
            ),
            country_code="",
            offering_type="personal",
            url=None,
            display_priority=-1,
        ))


@media_router.get("/{media_id}", response_model=MediaItemDetail)
async def get_media_item(
    media_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemDetail:
    country_code = await resolve_country_code(request, current_user)
    cache_key = _media_cache_key(media_id, country_code)
    redis = await get_redis()

    # Cache hit: serve cached public response, patch user data if authenticated
    cached = await redis.get(cache_key)
    if cached:
        result = MediaItemDetail.model_validate(json.loads(cached))
        asyncio.create_task(_increment_view_count(media_id))
        if current_user is not None:
            await _patch_user_detail(result, db, current_user, media_id)
        return result

    # Cold path: full DB load
    asyncio.create_task(_increment_view_count(media_id))

    service = MediaService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    result = MediaItemDetail.model_validate(item)

    # Filter watch providers from already-loaded data.
    # model_validate populated all countries — replace with this country only.
    country_providers = sorted(
        (mwp for mwp in item.watch_providers if mwp.country_code == country_code),
        key=lambda mwp: mwp.display_priority,
    )
    offering_order = {"personal": 0, "flatrate": 1, "rent": 2, "buy": 3, "free": 4, "ads": 5}
    # Cap to top-N per offering type so the "Where to Watch" section doesn't
    # overwhelm the page. TMDB's display_priority already ranks by relevance.
    _WP_MAX_PER_TYPE = 5
    capped: list[MediaWatchProviderOut] = []
    seen: dict[str, int] = {}
    for mwp in sorted(
        (MediaWatchProviderOut.model_validate(mwp) for mwp in country_providers),
        key=lambda wp: offering_order.get(wp.offering_type, 99),
    ):
        bucket = seen.get(mwp.offering_type, 0)
        if bucket >= _WP_MAX_PER_TYPE:
            continue
        seen[mwp.offering_type] = bucket + 1
        capped.append(mwp)
    result.watch_providers = capped

    # Cache public response (no user-specific data)
    response_data = result.model_dump(mode="json")
    await redis.set(cache_key, json.dumps(response_data), ex=_MEDIA_DETAIL_TTL)

    # Patch user-specific data before returning
    if current_user is not None:
        await _patch_user_detail(result, db, current_user, media_id)

    return result
