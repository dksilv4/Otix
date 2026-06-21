# TODO: Review this file
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import (
    get_current_admin_user,
    get_current_user,
    get_db,
    get_optional_user,
    resolve_country_code,
)
from otix.api.media._utils import SEARCH_CACHE_TTL, _cache_key
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.lib.levels import compute_level_info
from otix.lib.media_rehydrate_progress import (
    channel_name,
    get_latest_progress,
    get_stored_result,
)
from otix.lib.sse import SseStreamConfig, create_sse_response
from otix.schemas.interaction import UserInteractionState
from otix.schemas.media import (
    CompanyOut,
    CompanySearchListResponse,
    ConfirmMatchRequest,
    ConfirmMatchResponse,
    ExternalIDRef,
    GameMatchBatchRequest,
    GameMatchBatchResponse,
    GameMatchRequest,
    GameMatchResponse,
    GenreOut,
    ImportGameResponse,
    LocalGameMatch,
    LocalGameMatchRequest,
    LocalGameMatchResponse,
    MediaItemListResponse,
    MediaItemSummary,
    PersonSearchResult,
    ProviderSearchRequest,
    ProviderSearchResponse,
    ProviderSearchResult,
    SeedFromTitlesRequest,
    SeedFromTitlesResponse,
    SteamGridGame,
    SteamGridSearchRequest,
    SteamGridSearchResponse,
    StructuredSearchResponse,
    SyncLocalGamesRequest,
    SyncLocalGamesResponse,
    TrackSearchResult,
)
from otix.services.company_service import CompanyService
from otix.services.external_id_service import ExternalIDService
from otix.services.game_matcher import GameMatcher
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult
from otix.services.people_service import PeopleService
from otix.services.search_log_service import log_search
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


@media_router.get("/suggestions", response_model=list[MediaItemSummary])
async def search_suggestions(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(8, ge=1, le=20),
    media_type: str | None = Query(None, description="Filter by media type: movie, show, game, music"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[MediaItemSummary]:
    """Lightweight autocomplete — quick search, no backfill, no embeddings."""
    exclude_adult = should_exclude_adult(current_user)
    service = MediaService(db)
    items, _total, _has_more = await service.search_media(
        query_str=q,
        media_type=media_type,
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

    # ── Third-party fallback: search IGDB / TMDB directly when sparse ──
    if len(summaries) < 5 and _should_backfill(q) and media_type:
        try:
            redis = await _get_redis()
            poll_hash = _poll_query_hash(q, media_type)
            existing = await redis.keys(f"backfill:{poll_hash}:*")
            if not existing:
                # Skip third-party search if credentials not configured
                if media_type == "game" and settings.igdb_client_id:
                    from otix.providers.igdb.client import IGDBProvider

                    provider = IGDBProvider(redis)
                    raw = await provider.search_games(q, limit=12, fields="id,name,slug,cover.url")
                    for g in raw:
                        gid = str(g.get("id") or "")
                        if not gid or any(s.id == gid for s in summaries):
                            continue
                        cover = g.get("cover")
                        poster = None
                        if cover and isinstance(cover, dict):
                            url = cover.get("url")
                            if url:
                                poster = str(url).replace("t_thumb", "t_cover_big")
                        name = g.get("name") or q
                        slug = g.get("slug") or ""

                        summaries.append(
                            MediaItemSummary(
                                id=gid,
                                media_type="game",
                                title=name,
                                slug=slug,
                                posterUrl=poster,
                                popularity=0,
                                avgRating=None,
                                ratingCount=0,
                                isAdult=False,
                            )
                        )
                    # Also fire the backfill task so full catalog import happens
                    app.send_task("search.backfill", args=[q, media_type], priority=5)
                elif media_type in ("movie", "show"):
                    from otix.providers.tmdb.client import TMDBProvider

                    provider = TMDBProvider(redis)
                    kind = "movie" if media_type == "movie" else "tv"
                    data = await provider.search_multi(q, page=1)
                    for item in data.get("results", [])[:8]:
                        if item.get("media_type") == kind and item.get("id"):
                            tid = f"tmdb-{item['id']}"
                            if not any(s.id == tid for s in summaries):
                                summaries.append(
                                    MediaItemSummary(
                                        id=tid,
                                        media_type=media_type,
                                        title=item.get("title") or item.get("name", q),
                                        slug=item.get("title", "").lower().replace(" ", "-")
                                        if item.get("title")
                                        else "",
                                        posterUrl=f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}"
                                        if item.get("poster_path")
                                        else None,
                                        popularity=item.get("popularity", 0),
                                        avgRating=item.get("vote_average"),
                                        ratingCount=item.get("vote_count", 0),
                                        isAdult=item.get("adult", False),
                                    )
                                )
                    app.send_task("search.backfill", args=[q, media_type], priority=5)
            summaries.sort(key=lambda s: s.popularity, reverse=True)
        except Exception:
            logger.warning("suggestions third-party search failed", query=q, media_type=media_type, exc_info=True)

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
                ExternalIDService(db).batch_find_by_entity_ids(
                    "media_item",
                    album_media_ids,
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
            for entity_id, pairs in eid_result.items():
                for provider, external_id in pairs:
                    if provider == "musicbrainz_release_group":
                        rg_map[entity_id] = external_id
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
    service = MediaService(db)
    genres = await service.list_genres(media_type)
    return [GenreOut.model_validate(g) for g in genres]


@media_router.get("/company", response_model=CompanyOut)
async def get_company_by_slug(
    slug: str = Query(None, description="Company slug (deprecated, use /company/{id})"),
    id: str = Query(None, description="Company ID"),
    db: AsyncSession = Depends(get_db),
) -> CompanyOut:
    if not id and not slug:
        raise HTTPException(status_code=400, detail="Provide id or slug")
    result = await CompanyService.get_by_id_or_slug(db, id=id, slug=slug)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyOut.model_validate(result)


@media_router.get("/search/companies", response_model=CompanySearchListResponse)
async def search_companies(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> CompanySearchListResponse:
    """Search companies by name using hybrid vector-keyword queries."""
    query_embedding = await _call_embed_query(q)

    service = CompanyService(db)
    companies = await service.search_companies(
        query_str=q,
        limit=limit + 1,
        query_embedding=query_embedding,
    )
    has_more = len(companies) > limit
    if has_more:
        companies = companies[:limit]
    return CompanySearchListResponse(
        items=[CompanyOut.model_validate(c) for c in companies],
        has_more=has_more,
    )


@media_router.get("/certifications", response_model=list[str])
async def list_certifications(
    media_type: str | None = Query(None, description="Filter certifications to a specific media type"),
    country_code: str = Query("us", description="Country code for certification ratings (e.g. 'us', 'gb')"),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    service = MediaService(db)
    return await service.list_certifications(country_code=country_code, media_type=media_type)


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
            log_search(
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
            eid_by_entity = await ExternalIDService(db).batch_find_by_entity_ids("track", track_ids)
            spotify_id_map = {}
            for entity_id, pairs in eid_by_entity.items():
                for provider, external_id in pairs:
                    if provider == "spotify":
                        spotify_id_map[entity_id] = external_id

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
        log_search(
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


@media_router.get("/search/grouped", response_model=StructuredSearchResponse)
async def search_grouped(
    q: str = Query(..., min_length=1, description="Search query"),
    media_type_limit: int = Query(10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> StructuredSearchResponse:
    """Structured search — results grouped by media_type with tracks, people, and users.

    Runs per-type searches concurrently for a complete overview of all result
    categories in a single response. The frontend renders each group as its
    own carousel or section.
    """
    exclude_adult = should_exclude_adult(current_user)
    query_embedding = await _call_embed_query(q)

    async def _search_type(mt: str) -> tuple[str, list[MediaItemSummary], int]:
        async with async_session() as session:
            svc = MediaService(session)
            items, total, _ = await svc.search_media(
                query_str=q,
                media_type=mt,
                page=1,
                page_size=media_type_limit,
                query_embedding=query_embedding,
                exclude_adult=exclude_adult,
            )
            return mt, [MediaItemSummary.model_validate(i) for i in items], total

    async def _search_tracks_() -> tuple[list[TrackSearchResult], int]:
        from otix.domain.media import Track

        async with async_session() as session:
            count_q = select(func.count(Track.id)).where(Track.title.ilike(f"%{q}%"))
            total = await session.scalar(count_q) or 0
            svc = MediaService(session)
            tracks = await svc.search_tracks(query_str=q, limit=20)

        track_ids = [t.id for t in tracks]
        spotify_id_map: dict[str, str] = {}
        if track_ids:
            eid_by_entity = await ExternalIDService(db).batch_find_by_entity_ids("track", track_ids)
            for entity_id, pairs in eid_by_entity.items():
                for provider, external_id in pairs:
                    if provider == "spotify":
                        spotify_id_map[entity_id] = external_id

        results: list[TrackSearchResult] = []
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
            results.append(
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
        return results, total

    async def _search_people_() -> tuple[list[PersonSearchResult], int]:
        from otix.domain.people import Person

        async with async_session() as session:
            count_q = select(func.count(Person.id)).where(Person.name.ilike(f"%{q}%"), Person.embedding.isnot(None))
            total = await session.scalar(count_q) or 0
            svc = PeopleService(session)
            people = await svc.search_people(query_str=q, limit=10, query_embedding=query_embedding)
            return [PersonSearchResult.model_validate(p) for p in people], total

    async def _search_users_() -> tuple[list[UserSearchResult], int]:
        from otix.domain.user import User

        async with async_session() as session:
            count_q = select(func.count(User.id)).where(
                User.username.ilike(f"%{q}%"),
                User.is_active == True,
                User.embedding.isnot(None),
            )
            total = await session.scalar(count_q) or 0
            from otix.schemas.user import UserSearchResult as UserSearchResultSchema

            fts_stmt = select(User.id).where(
                User.username.ilike(f"%{q}%"),
                User.is_active == True,
                User.embedding.isnot(None),
            )
            branches = [fts_stmt]
            if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
                vector_stmt = (
                    select(User.id)
                    .where(User.is_active == True, User.embedding.isnot(None))
                    .order_by(User.embedding.cosine_distance(query_embedding))
                    .limit(10)
                )
                branches.append(vector_stmt)

            matched_ids = union(*branches).subquery()

            stmt = select(User).where(
                User.id.in_(select(matched_ids)),
                User.is_active == True,
                User.embedding.isnot(None),
            )

            sim = func.similarity(User.username, q)
            if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
                vector_sim = func.coalesce(1 - User.embedding.cosine_distance(query_embedding), 0)
            else:
                vector_sim = 0

            order = (sim * 5 + vector_sim * 5).desc()
            stmt = stmt.order_by(order).limit(10)

            result = await session.scalars(stmt)
            users = list(result)

            items = []
            for user in users:
                gamification = compute_level_info(user.total_xp)
                items.append(
                    UserSearchResultSchema(
                        id=user.id,
                        username=user.username,
                        avatar_url=user.avatar_url,
                        bio=user.bio,
                        level=gamification["level"],
                        level_title=gamification["level_title"],
                        is_admin=user.is_admin,
                    )
                )
            return items, total

    async def _search_best_results() -> list[MediaItemSummary]:
        async with async_session() as session:
            svc = MediaService(session)
            items, _, _ = await svc.search_media(
                query_str=q,
                media_type=None,
                page=1,
                page_size=3,
                query_embedding=query_embedding,
                exclude_adult=exclude_adult,
            )
            return [MediaItemSummary.model_validate(i) for i in items]

    # Run all searches concurrently
    (
        type_results,
        (tracks_list, tracks_count),
        (people_list, people_count),
        (users_list, users_count),
        best_media,
    ) = await asyncio.gather(
        asyncio.gather(*[_search_type(mt) for mt in ("movie", "show", "game", "music")]),
        _search_tracks_(),
        _search_people_(),
        _search_users_(),
        _search_best_results(),
    )

    # Score candidates for media-agnostic best results
    candidates = []
    # top 3 media items
    for i, item in enumerate(best_media[:3]):
        candidates.append((item, i))
    # top 2 people
    for i, item in enumerate(people_list[:2]):
        candidates.append((item, i))
    # top 2 users
    for i, item in enumerate(users_list[:2]):
        candidates.append((item, i))
    # top 2 tracks
    for i, item in enumerate(tracks_list[:2]):
        candidates.append((item, i))

    scored = []
    seen = set()
    for item, pos in candidates:
        mtype = getattr(item, "media_type", "unknown")
        ukey = (mtype, item.id)
        if ukey in seen:
            continue
        seen.add(ukey)

        # Get name/title for scoring
        name = ""
        if hasattr(item, "title"):
            name = item.title
        elif hasattr(item, "name"):
            name = item.name
        elif hasattr(item, "username"):
            name = item.username

        name_lower = name.lower().strip()
        q_lower = q.lower().strip()

        score = 0.0
        if name_lower == q_lower:
            score += 10.0
        elif name_lower.startswith(q_lower):
            score += 5.0
        elif q_lower in name_lower:
            score += 2.0

        # Preference bias
        if mtype in ("movie", "show", "game", "music"):
            score += 0.5
        elif mtype == "person":
            score += 0.3
        elif mtype == "user":
            score += 0.2
        else:  # track
            score += 0.1

        # Position penalty
        score -= pos * 0.1

        scored.append((score, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    best_results = [item for _, item in scored[:3]]

    grouped: dict[str, list[MediaItemSummary]] = {"movie": [], "show": [], "game": [], "music": []}
    total_all = 0
    movie_count = 0
    show_count = 0
    game_count = 0
    music_count = 0

    for mt, items, type_total in type_results:
        grouped[mt] = items
        total_all += type_total
        if mt == "movie":
            movie_count = type_total
        elif mt == "show":
            show_count = type_total
        elif mt == "game":
            game_count = type_total
        elif mt == "music":
            music_count = type_total

    # Add other categories' counts to total_all
    total_all += tracks_count + people_count + users_count

    return StructuredSearchResponse(
        best_results=best_results,
        movies=grouped["movie"],
        shows=grouped["show"],
        games=grouped["game"],
        music=grouped["music"],
        tracks=tracks_list,
        people=people_list,
        users=users_list,
        total=total_all,
        movies_count=movie_count,
        shows_count=show_count,
        games_count=game_count,
        music_count=music_count,
        tracks_count=tracks_count,
        people_count=people_count,
        users_count=users_count,
    )


@media_router.post("/match", response_model=GameMatchResponse)
async def match_game(
    body: GameMatchRequest,
    db: AsyncSession = Depends(get_db),
) -> GameMatchResponse:
    """Match a single game against the Otix catalog.

    Returns ranked candidates and an optional auto_match.  No catalog
    mutations occur — use ``POST /match/confirm`` to persist a match.
    """
    redis = await _get_redis()
    matcher = GameMatcher(db, redis)
    return await matcher.match_single(body)


@media_router.post("/match/batch", response_model=GameMatchBatchResponse)
async def match_games_batch(
    body: GameMatchBatchRequest,
    db: AsyncSession = Depends(get_db),
) -> GameMatchBatchResponse:
    """Match multiple games in a single batch call.

    Each game runs through the full pipeline and returns ranked
    candidates plus an optional auto_match.
    """
    redis = await _get_redis()
    matcher = GameMatcher(db, redis)
    matches = await matcher.match_batch(body.games)
    return GameMatchBatchResponse(matches=matches)


@media_router.post("/match/stream")
async def match_games_stream(
    body: GameMatchBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> StreamingResponse:
    """SSE stream of per-game match progress for the desktop orchestrator.

    Returns a ``text/event-stream`` response.  Each game emits an
    ``event: game-progress`` frame with its match status.  A final
    ``event: complete`` frame carries aggregate statistics.

    Compatible with any SSE client — no special library needed beyond
    standard ``EventSource`` or a plain ``fetch`` with streaming.
    """
    redis = await _get_redis()
    matcher = GameMatcher(db, redis)
    return StreamingResponse(
        matcher.match_batch_stream(body.games),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@media_router.post("/match/confirm", response_model=ConfirmMatchResponse)
async def confirm_match(
    body: ConfirmMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConfirmMatchResponse:
    """Confirm a match candidate or reject all suggestions.

    - If ``igdb_id`` is set and ``media_item_id`` is null, the game is
      imported from IGDB first, then linked.
    - If ``rejected_permanently`` is true, future scans won't re-suggest
      this game.
    """
    from otix.services.match_confirmation import MatchConfirmationService

    svc = MatchConfirmationService(db)
    result = await svc.confirm(body)
    await db.commit()
    return result


@media_router.post("/match/unlink", response_model=ConfirmMatchResponse)
async def unlink_match(
    query_id: str = Query(..., description="Provider:ID, e.g. 'epic:AppName'"),
    db: AsyncSession = Depends(get_db),
) -> ConfirmMatchResponse:
    """Remove an external ID mapping so a game can be re-matched.

    Also clears any permanent rejection record for this game.
    """
    from otix.services.match_confirmation import MatchConfirmationService

    svc = MatchConfirmationService(db)
    result = await svc.unlink(query_id)
    await db.commit()
    return result


@media_router.post("/match-local-games")
async def match_local_games(
    body: LocalGameMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_optional_user),
) -> LocalGameMatchResponse:
    """Fuzzy-match local PC/ISO game titles to Otix catalog entries.

    Accepts a list of game (title + optional platform and Steam App ID) and
    returns the best-matching Otix media item per entry. Delegates to
    ``GameMatcher`` for the full multi-stage pipeline (external ID lookup,
    IGDB cross-reference, IGDB title search, trigram fallback).

    Backward-compatible wrapper around the internal ``/match/batch`` pipeline.
    """
    exclude_adult = should_exclude_adult(current_user)

    # Convert legacy LocalGameMatchRequest to GameMatchRequest batch
    requests: list[GameMatchRequest] = []
    for g in body.games:
        external_ids = None
        if g.steam_app_id:
            external_ids = [ExternalIDRef(source="steam", id=str(g.steam_app_id))]
        platforms = [g.platform] if g.platform else None
        requests.append(
            GameMatchRequest(
                title=g.title,
                platforms=platforms,
                external_ids=external_ids,
            )
        )

    redis = await _get_redis()
    matcher = GameMatcher(db, redis)
    results = await matcher.match_batch(requests)

    # Extract best match per result: auto_match first, then top candidate
    # Build list of (query_title, media_item_id, confidence)
    best_matches: list[tuple[str, str | None, float]] = []
    for r in results:
        best = r.auto_match or (r.candidates[0] if r.candidates else None)
        if best and best.media_item_id:
            best_matches.append((r.query_title, best.media_item_id, best.confidence))
        elif best and best.needs_import:
            best_matches.append((r.query_title, None, best.confidence))
        else:
            best_matches.append((r.query_title, None, 0.0))

    # Batch-fetch MediaItems for matched results
    matched_ids = list({mid for _, mid, _ in best_matches if mid is not None})
    media_items: dict[str, MediaItem] = {}
    if matched_ids:
        rows = await db.execute(select(MediaItem).where(MediaItem.id.in_(matched_ids)))
        media_items = {mi.id: mi for mi in rows.scalars().all()}

    matches: list[LocalGameMatch] = []
    for query_title, media_id, confidence in best_matches:
        confidence = round(confidence, 4)

        if media_id and media_id in media_items:
            item = media_items[media_id]
            if exclude_adult and item.is_adult:
                matches.append(LocalGameMatch(query_title=query_title, matched_media=None, confidence=0.0))
            else:
                matches.append(
                    LocalGameMatch(
                        query_title=query_title,
                        matched_media=MediaItemSummary.model_validate(item),
                        confidence=confidence,
                    )
                )
        else:
            matches.append(LocalGameMatch(query_title=query_title, matched_media=None, confidence=confidence))

    return LocalGameMatchResponse(matches=matches)


@media_router.post("/seed-from-titles")
async def seed_from_titles(
    body: SeedFromTitlesRequest,
    current_user: User = Depends(get_optional_user),
) -> SeedFromTitlesResponse:
    """Trigger background IGDB seeding for local game titles from a desktop scan.

    When a user runs a desktop game scan, the extracted titles (with optional
    platform and Steam App ID) are sent here so the backend can search IGDB or
    do direct Steam lookups for each game and import any missing game into the
    catalog. This ensures subsequent match-local-game calls can find them.

    The actual IGDB searches / Steam sync tasks run asynchronously via
    ``seed.igdb_from_titles``. This endpoint returns immediately with the
    Celery task ID for optional tracking.
    """
    # Dedup by normalized title, preferring entries with more context
    deduped: dict[str, SeedGameEntry] = {}
    for game in body.games:
        key = game.title.strip().lower()
        if not key:
            continue
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = game
        elif game.steam_app_id and not existing.steam_app_id:
            deduped[key] = game  # prefer entry with Steam App ID

    unique = list(deduped.values())
    if not unique:
        return SeedFromTitlesResponse(accepted=True, total_titles=0)

    games_data = [{"title": g.title, "platform": g.platform, "steam_app_id": g.steam_app_id} for g in unique]
    task = app.send_task("seed.igdb_from_titles", args=[games_data])

    # Track via Redis counter for debugging
    try:
        redis = await _get_redis()
        await redis.incr("seed_from_titles_count")
    except Exception:
        pass

    print(f"SEED_FROM_TITLES_HIT: {len(unique)} game -> task {task.id}", flush=True)
    logger.info("seed_from_titles_requested", total=len(unique), task_id=task.id)

    return SeedFromTitlesResponse(
        accepted=True,
        total_titles=len(unique),
        task_id=task.id,
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


BACKFILL_POLL_PROVIDERS = ["tmdb_movie", "tmdb_show", "igdb_game", "musicbrainz"]


@media_router.post("/{media_id}/rehydrate")
async def force_rehydrate_media(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    service = MediaService(db)
    item = await service.get_media_item_bare(media_id)
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
    request: Request,
    current_user: User = Depends(get_current_admin_user),
):
    """SSE stream of media rehydration progress events."""
    return await create_sse_response(
        SseStreamConfig(
            channel=channel_name(task_id),
            terminal_events=("rehydrate_complete", "error"),
            result_replay=lambda: get_stored_result(task_id),
            progress_replay=lambda: get_latest_progress(task_id),
        ),
        request,
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
    """Search IGDB for game, import missing ones async, return already-imported.

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

    # Filter out edition/variant game when the base game is also in results.
    has_base = any(game.get("version_parent") is None for game in igdb_results)
    if has_base:
        igdb_results = [g for g in igdb_results if g.get("version_parent") is None]

    igdb_ids = [str(r["id"]) for r in igdb_results if isinstance(r.get("id"), (int, str))]
    if not igdb_ids:
        return MediaItemListResponse(items=[])

    # Check which IGDB IDs already exist in Otix
    ext_id_service = ExternalIDService(db)
    existing_ids = await ext_id_service.batch_find_entity_ids("igdb", igdb_ids)

    # Build summary list from already-imported items
    summaries: list[MediaItemSummary] = []
    if existing_ids:
        entity_ids = [eid for eid in existing_ids.values() if eid]
        if entity_ids:
            media_service = MediaService(db)
            items = await media_service.get_media_items_by_ids(entity_ids)
            summaries = [MediaItemSummary.model_validate(item) for item in items]

    # Trigger Celery imports for game not yet in the DB.
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
            ext_id = await ExternalIDService(session).get_by_provider_ext_id(
                "igdb",
                str(igdb_id),
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


# ── Unified provider search ────────────────────────────────────────────


@media_router.post("/search-providers", response_model=ProviderSearchResponse)
async def search_providers(
    body: ProviderSearchRequest,
    db: AsyncSession = Depends(get_db),
) -> ProviderSearchResponse:
    """Search Otix catalog + IGDB + SteamGrid in one call.

    Returns deduplicated results from all three providers.  Missing IGDB
    games are imported asynchronously (Celery task).  SteamGrid results
    include artwork URLs (grid, logo, hero, icon).
    """
    redis = await _get_redis()
    results: list[ProviderSearchResult] = []
    backfill_pending = False

    # 1. Otix catalog
    try:
        media_service = MediaService(db)
        otix_results = await media_service.search_media(
            query_str=body.query,
            media_type="game",
            page_size=body.limit,
        )
        otix_items, _, _ = otix_results
        for item in otix_items:
            results.append(
                ProviderSearchResult(
                    provider="otix",
                    id=item.id,
                    title=item.title,
                    poster_url=item.poster_url,
                    slug=item.slug,
                )
            )
    except Exception:
        logger.exception("provider_search_otix_failed", q=body.query)

    # 2. IGDB (with auto-import for missing games)
    igdb_ids_seen: set[str] = set()
    if settings.igdb_client_id:
        try:
            from otix.providers.igdb.client import IGDBProvider

            provider = IGDBProvider(redis)
            igdb_raw = await provider.search_games(
                body.query,
                limit=body.limit,
                fields="id,name,slug,cover.url",
            )

            igdb_ids = [str(r["id"]) for r in igdb_raw if isinstance(r.get("id"), (int, str))]
            if igdb_ids:
                ext_id_service = ExternalIDService(db)
                existing = await ext_id_service.batch_find_entity_ids("igdb", igdb_ids)

                imported_entity_ids = [eid for eid in existing.values() if eid]
                imported_media: dict = {}
                if imported_entity_ids:
                    items = await media_service.get_media_items_by_ids(imported_entity_ids)
                    for item in items:
                        igdb_id = next(
                            (gid for gid, eid in existing.items() if eid == item.id),
                            None,
                        )
                        if igdb_id:
                            imported_media[igdb_id] = item

                missing_ids = [gid for gid in igdb_ids if gid not in existing]
                if missing_ids:
                    query_hash = _poll_query_hash(body.query, "game")
                    dedup_key = f"provider_search:{query_hash}"
                    already_triggered = await redis.get(dedup_key)
                    if not already_triggered:
                        for gid in missing_ids:
                            app.send_task("sync.igdb.game", args=[int(gid)])
                        await redis.set(dedup_key, "1", ex=120)
                    backfill_pending = True

            for g in igdb_raw:
                gid = str(g.get("id") or "")
                if not gid or gid in igdb_ids_seen:
                    continue
                igdb_ids_seen.add(gid)

                name = g.get("name") or body.query
                slug = g.get("slug") or ""
                cover = g.get("cover")
                poster = None
                if cover and isinstance(cover, dict):
                    url = cover.get("url")
                    if url:
                        poster = str(url).replace("t_thumb", "t_cover_big")

                otix_id = existing.get(gid) or (imported_media.get(gid) and imported_media[gid].id)
                result_id = otix_id or gid

                results.append(
                    ProviderSearchResult(
                        provider="igdb",
                        id=result_id,
                        title=name,
                        poster_url=poster,
                        slug=slug,
                    )
                )
        except Exception:
            logger.exception("provider_search_igdb_failed", q=body.query)

    # 3. SteamGridDB
    if settings.steamgrid_api_key:
        try:
            from otix.providers.steamgrid.client import SteamGridDBProvider

            sg_provider = SteamGridDBProvider(redis)
            sg_results = await sg_provider.search_games(body.query)

            for sg_game in sg_results[: body.limit]:
                sgdb_id = sg_game.get("id")
                if not sgdb_id:
                    continue
                name = sg_game.get("name") or body.query

                results.append(
                    ProviderSearchResult(
                        provider="steamgrid",
                        id=str(sgdb_id),
                        title=name,
                        poster_url=None,
                        slug=None,
                    )
                )
        except Exception:
            logger.exception("provider_search_steamgrid_failed", q=body.query)

    return ProviderSearchResponse(items=results, backfill_pending=backfill_pending)


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


# ── Sync local game (desktop → backend) ──────────────────────────────


@media_router.post("/sync-local-games", response_model=SyncLocalGamesResponse)
async def sync_local_games(
    body: SyncLocalGamesRequest,
    current_user: User = Depends(get_optional_user),
) -> SyncLocalGamesResponse:
    """Sync the user's locally detected game to the backend.

    Called from the desktop app after scanning and matching. Upserts game
    by (user_id, title, platform) so match state survives client-side clears.
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    from otix.domain.media import UserLocalGame

    async with async_session() as session:
        user_id = current_user.id
        upserted = 0

        # Fetch existing game for this user
        from sqlalchemy import select

        existing = (
            (await session.execute(select(UserLocalGame).where(UserLocalGame.user_id == user_id))).scalars().all()
        )

        existing_by_key: dict[tuple[str, str], UserLocalGame] = {}
        for g in existing:
            existing_by_key[(g.title.lower(), g.platform)] = g

        incoming_keys: set[tuple[str, str]] = set()

        for game in body.games:
            key = (game.title.lower(), game.platform)
            incoming_keys.add(key)

            existing_game = existing_by_key.get(key)
            if existing_game:
                # Update existing
                existing_game.media_item_id = game.otix_media_id or existing_game.media_item_id
                existing_game.match_suggestion_media_id = (
                    game.match_suggestion_media_id or existing_game.match_suggestion_media_id
                )
                existing_game.last_seen_at = func.now()
            else:
                # Insert new
                new_game = UserLocalGame(
                    user_id=user_id,
                    title=game.title,
                    platform=game.platform,
                    media_item_id=game.otix_media_id,
                    match_suggestion_media_id=game.match_suggestion_media_id,
                )
                session.add(new_game)
            upserted += 1

        # Delete game no longer present on the desktop
        deleted = 0
        for key, existing_game in existing_by_key.items():
            if key not in incoming_keys:
                await session.delete(existing_game)
                deleted += 1

        # Auto-claim matched game (fire and forget via interaction service)
        from otix.services.interaction_service import InteractionService

        interaction_svc = InteractionService(session)
        for game in body.games:
            if game.otix_media_id:
                try:
                    await interaction_svc.set_interaction(
                        user_id=user_id,
                        media_item_id=game.otix_media_id,
                        interaction_type="owned",
                    )
                except Exception:
                    pass  # best-effort claim

        await session.commit()

    logger.info("sync_local_games_complete", user_id=user_id, upserted=upserted, deleted=deleted)

    return SyncLocalGamesResponse(upserted=upserted, deleted=deleted)
