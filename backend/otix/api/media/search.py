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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import (
    get_current_admin_user,
    get_db,
    get_optional_user,
    resolve_country_code,
)
from otix.api.media._utils import SEARCH_CACHE_TTL, _cache_key, _embedding_cache_key
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import (
    CompanyOut,
    GenreOut,
    ImportGameResponse,
    LocalGameMatch,
    LocalGameMatchRequest,
    LocalGameMatchResponse,
    MediaItemListResponse,
    MediaItemSummary,
    SteamGridGame,
    SteamGridSearchRequest,
    SteamGridSearchResponse,
    TrackSearchResult,
)
from otix.domain.asset import MediaRelease
from otix.domain.company import Company
from otix.domain.genre import Genre, MediaGenre
from otix.domain.media import ExternalID, MediaItem
from otix.domain.search_log import SearchLog
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.media_rehydrate_progress import (
    channel_name,
    get_latest_progress,
    get_stored_result,
)
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult
from otix.tasks.sync.search import BACKFILL_RESULT_THRESHOLD as BACKFILL_THRESHOLD

logger = structlog.get_logger()

media_router = APIRouter()


async def _get_redis():
    """Late-import get_redis so tests can patch otix.api.media.get_redis."""
    from otix.api.media import get_redis as _gr

    return await _gr()


async def _call_embed_query(q: str):
    """Late-import _embed_query so tests can patch otix.api.media._embed_query."""
    from otix.api.media import _embed_query as _eq

    return await _eq(q)


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


@media_router.get("/suggestions", response_model=list[MediaItemSummary])
async def search_suggestions(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[MediaItemSummary]:
    """Lightweight autocomplete — quick search, no backfill, no embeddings."""
    exclude_adult = should_exclude_adult(current_user)
    service = MediaService(db)
    items, _total, _has_more = await service.search_media(
        query_str=q,
        page=1,
        page_size=limit,
        exclude_adult=exclude_adult,
    )
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if current_user is not None and summaries:
        from otix.services.interaction_service import InteractionService

        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return summaries


@media_router.get("/", response_model=MediaItemListResponse)
async def list_media(
    request: Request,
    media_type: str | None = Query(None, description="movie, show, game, or music"),
    genre: str | None = Query(None, description="Genre slug"),
    company: str | None = Query(None, description="Company ID"),
    language: str | None = Query(None, description="Language code (e.g. 'ja', 'ko')"),
    is_anime: bool | None = Query(None, description="Filter to anime (movie/show only)"),
    has_artwork: bool = Query(False, description="Only return items with both textless poster and logo"),
    sort_by: str | None = Query(
        None, description="popularity, rating, release_date, title, revenue, budget, or profit"
    ),
    sort_dir: str | None = Query(None, description="Sort direction: asc or desc (default desc)"),
    certification: str | None = Query(
        None, description="Filter by certification in the user's country (e.g. 'PG-13', 'R', 'TV-MA')"
    ),
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

    if media_type == "music":
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
    if media_type == "music":
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
    redis = await _get_redis()
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
        asyncio.create_task(
            _log_search(
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
            )
        )
        return cached_response

    # Cold path: full search + embed
    query_embedding = await _call_embed_query(q)

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
            async with async_session() as tracks_session:
                tracks_service = MediaService(tracks_session)
                return await tracks_service.search_tracks(query_str=q, limit=20)

        tracks_future: asyncio.Task[list] | None = asyncio.ensure_future(_search_tracks_with_fresh_session())
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
    asyncio.create_task(
        _log_search(
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
        )
    )

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


@media_router.post("/match-local-games")
async def match_local_games(
    body: LocalGameMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_optional_user),
) -> LocalGameMatchResponse:
    """Fuzzy-match local PC/ISO game titles to Otix catalog entries.

    Accepts a list of raw game titles (from the desktop scanner) and returns
    the best-matching Otix media item per title using trigram similarity.
    """
    svc = MediaService(db)
    exclude_adult = should_exclude_adult(current_user)
    matches: list[LocalGameMatch] = []

    results = await svc.match_local_games(body.titles)

    for query_title, item, confidence in results:
        summary: LocalGameMatch
        if item is not None:
            if exclude_adult and item.is_adult:
                summary = LocalGameMatch(query_title=query_title, matched_media=None, confidence=0.0)
            else:
                summary = LocalGameMatch(
                    query_title=query_title,
                    matched_media=MediaItemSummary.model_validate(item),
                    confidence=round(confidence, 4),
                )
        else:
            summary = LocalGameMatch(query_title=query_title, matched_media=None, confidence=round(confidence, 4))
        matches.append(summary)

    return LocalGameMatchResponse(matches=matches)


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

        redis = await _get_redis()
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
    query_embedding = await _call_embed_query(q)
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
    redis = await _get_redis()
    keys = [f"backfill:{query_hash}:{p}" for p in BACKFILL_POLL_PROVIDERS]
    vals = await redis.mget(keys)
    all_done = all(v is not None for v in vals)

    return MediaItemListResponse(
        items=summaries,
        has_more=False,
        total=total,
        backfill_pending=not all_done,
    )


@media_router.get("/search/external", response_model=MediaItemListResponse)
async def search_external_games(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> MediaItemListResponse:
    """Search IGDB for games, import missing ones async, return already-imported.

    Games already in the Otix database are returned immediately.  Any that
    aren't yet imported trigger a Celery task (sync.igdb.game) and the
    response has ``backfill_pending = True`` so the frontend can poll for
    newly-imported items.  A 2-minute Redis TTL on the query hash prevents
    duplicate Celery triggers from repeated polling.
    """
    redis = await _get_redis()
    from otix.providers.igdb.client import IGDBProvider

    provider = IGDBProvider(redis)

    # Search IGDB — include version_parent to filter editions later
    fields = "id,name,version_parent"
    try:
        igdb_results = await provider.search_games(q, limit=limit, fields=fields)
    except Exception:
        logger.exception("igdb_external_search_failed", q=q)
        return MediaItemListResponse(items=[])

    # Filter out edition/variant games when the base game is also in results.
    has_base = any(game.get("version_parent") is None for game in igdb_results)
    if has_base:
        igdb_results = [g for g in igdb_results if g.get("version_parent") is None]

    igdb_ids = [str(r["id"]) for r in igdb_results if isinstance(r.get("id"), (int, str))]
    if not igdb_ids:
        return MediaItemListResponse(items=[])

    # Check which IGDB IDs already exist in Otix (single query)
    existing_eids = (
        await db.scalars(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id.in_(igdb_ids),
            )
        )
    ).all()
    existing_ids: dict[str, str] = {}
    for eid in existing_eids:
        media_id = eid.entity_id or eid.media_item_id
        if media_id:
            existing_ids[eid.external_id] = media_id

    # Build summary list from already-imported items
    summaries: list[MediaItemSummary] = []
    if existing_ids:
        items = (await db.scalars(select(MediaItem).where(MediaItem.id.in_(existing_ids.values())))).all()
        summaries = [MediaItemSummary.model_validate(item) for item in items]

    # Trigger Celery imports for games not yet in the DB.
    missing_ids = [gid for gid in igdb_ids if gid not in existing_ids]
    if missing_ids:
        query_hash = _poll_query_hash(q, "game")
        dedup_key = f"ext_import:{query_hash}"
        already_triggered = await redis.get(dedup_key)
        if not already_triggered:
            for gid in missing_ids:
                app.send_task("sync.igdb.game", args=[int(gid)])
            await redis.set(dedup_key, "1", ex=120)  # 2 min dedup

    return MediaItemListResponse(
        items=summaries,
        backfill_pending=bool(missing_ids),
        has_more=False,
        total=len(summaries),
    )


@media_router.post("/import/igdb", response_model=ImportGameResponse)
async def import_igdb_game(
    igdb_id: int = Query(..., description="IGDB game ID to import"),
) -> ImportGameResponse:
    """Import a game from IGDB into the Otix database.

    Fetches full game data, transforms, upserts, hydrates, and returns
    the Otix media ID so the frontend can complete the link.
    """
    from otix.tasks.sync.igdb import _sync_igdb_game

    try:
        result = await _sync_igdb_game(igdb_id, force=True)
    except Exception:
        logger.exception("igdb_import_failed", igdb_id=igdb_id)
        raise HTTPException(status_code=500, detail="IGDB import failed. Please try again.")

    if result is None:
        # Sync may have skipped — look up existing entry by IGDB ID
        async with async_session() as session:
            ext_id = await session.scalar(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id == str(igdb_id),
                )
            )
            if ext_id is not None:
                media_id = ext_id.entity_id or ext_id.media_item_id
                if media_id:
                    item = await session.get(MediaItem, media_id)
                    if item is not None:
                        logger.info(
                            "igdb_import_returned_existing", igdb_id=igdb_id, media_id=item.id, title=item.title
                        )
                        return ImportGameResponse(
                            media_id=item.id,
                            title=item.title,
                            slug=item.slug,
                        )

        raise HTTPException(status_code=404, detail="IGDB game not found or import failed")

    # Sync succeeded — look up the slug from the newly created/updated item
    async with async_session() as session:
        item = await session.get(MediaItem, result["otix_id"])
        slug = item.slug if item else ""

    logger.info("igdb_import_success", igdb_id=igdb_id, media_id=result["otix_id"], title=result["title"])
    return ImportGameResponse(
        media_id=result["otix_id"],
        title=result["title"],
        slug=slug,
    )


@media_router.post("/search-steamgrid", response_model=SteamGridSearchResponse)
async def search_steamgrid(
    body: SteamGridSearchRequest,
) -> SteamGridSearchResponse:
    """Search SteamGridDB for game art assets.

    Returns grid, logo, hero, and icon URLs for the best-matching game.
    Used by the desktop game scanner match modal to get premium game art.
    """
    redis = await _get_redis()
    from otix.providers.steamgrid.client import SteamGridDBProvider

    provider = SteamGridDBProvider(redis)

    items: list[SteamGridGame] = []

    try:
        results = await provider.search_games(body.query)
    except Exception:
        logger.exception("steamgrid_search_failed", query=body.query)
        return SteamGridSearchResponse(items=[])

    for game in results[:5]:
        sgdb_id = game.get("id")
        name = game.get("name")
        if not sgdb_id or not name:
            continue

        # Fetch first grid (460x215), logo, hero, icon
        grid_url = None
        logo_url = None
        hero_url = None
        icon_url = None

        try:
            grids = await provider.get_grids(int(sgdb_id), dimensions="460x215")
            if grids and isinstance(grids, list):
                grid_url = grids[0].get("url")
        except Exception:
            pass

        try:
            logos = await provider.get_logos(int(sgdb_id))
            if logos and isinstance(logos, list):
                logo_url = logos[0].get("url")
        except Exception:
            pass

        try:
            heroes = await provider.get_heroes(int(sgdb_id))
            if heroes and isinstance(heroes, list):
                hero_url = heroes[0].get("url")
        except Exception:
            pass

        try:
            icons = await provider.get_icons(int(sgdb_id))
            if icons and isinstance(icons, list):
                icon_url = icons[0].get("url")
        except Exception:
            pass

        items.append(
            SteamGridGame(
                sgdb_id=int(sgdb_id),
                name=str(name),
                grid_url=grid_url,
                logo_url=logo_url,
                hero_url=hero_url,
                icon_url=icon_url,
            )
        )

    return SteamGridSearchResponse(items=items)
