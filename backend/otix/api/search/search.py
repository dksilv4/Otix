"""Search endpoint functions — no router, just callables for search/router.py."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from typing import Any

import structlog
from fastapi import Depends, HTTPException, Query, Request
from sqlalchemy import func, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user, resolve_country_code
from otix.api.search.embedding import SEARCH_CACHE_TTL, _cache_key, _embed_query, _grouped_cache_key, _poll_query_hash, _suggestions_cache_key
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.lib.levels import compute_level_info
from otix.schemas.interaction import UserInteractionState
from otix.schemas.media import (
    CompanyOut,
    CompanySearchListResponse,
    MediaItemListResponse,
    MediaItemSummary,
    PersonSearchResult,
    StructuredSearchResponse,
    TrackSearchResult,
)
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.company_service import CompanyService
from otix.services.external_id_service import ExternalIDService
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult
from otix.services.people_service import PeopleService
from otix.services.search_log_service import log_search
from otix.tasks.sync.search import BACKFILL_RESULT_THRESHOLD as BACKFILL_THRESHOLD

logger = structlog.get_logger()

BACKFILL_POLL_PROVIDERS = ["tmdb_movie", "tmdb_show", "igdb_game", "musicbrainz"]


def _should_backfill(q: str) -> bool:
    stripped = q.strip()
    if len(stripped) < 2:
        return False
    if stripped.isdigit():
        return False
    if re.search(r"[^aeiou\s]{4,}", stripped, re.IGNORECASE):
        return False
    return True


async def _get_redis():
    from otix.api.search import get_redis as _gr
    return await _gr()


# ── Search suggestions ──────────────────────────────────────────────────


async def search_suggestions(
    q: str,
    limit: int,
    media_type: str | None,
    db: AsyncSession,
    current_user: User | None,
) -> list[MediaItemSummary]:
    exclude_adult = should_exclude_adult(current_user)

    # Check Redis cache first (backfill results are not cached; they're ephemeral)
    redis = await _get_redis()
    cache_key = _suggestions_cache_key(q, limit, media_type, exclude_adult)
    cached = await redis.get(cache_key)
    if cached:
        summaries = [MediaItemSummary(**item) for item in json.loads(cached)]
        if current_user is not None and summaries:
            interaction_service = InteractionService(db)
            batch = await interaction_service.get_batch_interactions(
                user_id=current_user.id, media_item_ids=[s.id for s in summaries],
            )
            for summary in summaries:
                state = batch.get(summary.id, {})
                summary.user_interactions = UserInteractionState(**state)
        return summaries

    service = MediaService(db)
    items, _total, _has_more = await service.search_media(
        query_str=q, media_type=media_type, page=1, page_size=limit, exclude_adult=exclude_adult,
    )
    await enrich_items_with_assets(db, items)
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id, media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    # Cache the base results (without backfill additions)
    await redis.set(cache_key, json.dumps([s.model_dump(mode="json") for s in summaries]), ex=SEARCH_CACHE_TTL)

    if len(summaries) < 5 and _should_backfill(q) and media_type:
        try:
            redis = await _get_redis()
            poll_hash = _poll_query_hash(q, media_type)
            existing = await redis.keys(f"backfill:{poll_hash}:*")
            if not existing:
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
                        summaries.append(
                            MediaItemSummary(
                                id=gid, media_type="game", title=g.get("name") or q,
                                slug=g.get("slug") or "", posterUrl=poster,
                                popularity=0, avgRating=None, ratingCount=0, isAdult=False,
                            )
                        )
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
                                        id=tid, media_type=media_type,
                                        title=item.get("title") or item.get("name", q),
                                        slug=(item.get("title") or item.get("name") or "").lower().replace(" ", "-"),
                                        posterUrl=f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}"
                                        if item.get("poster_path") else None,
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


# ── Search ───────────────────────────────────────────────────────────────


async def search_media(
    q: str,
    media_type: str | None,
    sort_by: str | None,
    page: int,
    page_size: int,
    db: AsyncSession,
    current_user: User | None,
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    redis = await _get_redis()
    cache_key = _cache_key(q, media_type, sort_by, page, page_size, exclude_adult)

    cached = await redis.get(cache_key)
    if cached:
        cached_response = MediaItemListResponse.model_validate(json.loads(cached))
        if current_user is not None and cached_response.items:
            interaction_service = InteractionService(db)
            batch = await interaction_service.get_batch_interactions(
                user_id=current_user.id, media_item_ids=[s.id for s in cached_response.items],
            )
            for summary in cached_response.items:
                state = batch.get(summary.id, {})
                summary.user_interactions = UserInteractionState(**state)
        asyncio.create_task(
            log_search(
                q=q, media_type=media_type, sort_by=sort_by, page=page, page_size=page_size,
                result_count=cached_response.total, items_returned=len(cached_response.items),
                tracks_returned=len(cached_response.tracks), backfill_triggered=cached_response.backfill_pending,
                cache_hit=True, query_embedding_available=None,
                user_id=current_user.id if current_user else None,
                is_bot=current_user.is_bot if current_user else False,
            )
        )
        return cached_response

    query_embedding = await _embed_query(q)
    service = MediaService(db)

    search_future = asyncio.ensure_future(
        service.search_media(
            query_str=q, media_type=media_type, sort_by=sort_by, page=page, page_size=page_size,
            query_embedding=query_embedding, exclude_adult=exclude_adult,
        )
    )
    if page == 1 and (media_type is None or media_type == "music"):
        async def _search_tracks():
            async with async_session() as s:
                tracks = await MediaService(s).search_tracks(query_str=q, limit=20)
                album_items = [
                    t.album.media_item
                    for t in tracks
                    if t.album is not None and t.album.media_item is not None
                ]
                await enrich_items_with_assets(s, album_items)
                return tracks
        tracks_future: asyncio.Task | None = asyncio.ensure_future(_search_tracks())
    else:
        tracks_future = None

    items, total, has_more = await search_future
    await enrich_items_with_assets(db, items)
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    track_summaries: list[TrackSearchResult] = []
    if tracks_future is not None:
        tracks = await tracks_future
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
                    id=t.id, title=t.title, track_number=t.track_number,
                    disc_number=t.disc_number, duration_ms=t.duration_ms,
                    preview_url=t.preview_url,
                    avg_rating=t.avg_rating, rating_count=t.rating_count,
                    album_id=t.album.media_item_id, album_title=album_item.title,
                    album_poster_url=album_item._resolved_poster_url or album_item.poster_url, album_artist_name=artist_name,
                    album_slug=album_item.slug,
                )
            )

    backfill_pending = False
    if page == 1 and total < BACKFILL_THRESHOLD and _should_backfill(q):
        query_hash = _poll_query_hash(q, media_type)
        key = f"backfill:{query_hash}"
        if not await redis.get(key):
            await redis.set(key, "1", ex=300)
            app.send_task("search.backfill", args=[q, media_type])
            backfill_pending = True

    response = MediaItemListResponse(
        items=summaries, tracks=track_summaries,
        has_more=has_more, total=total, backfill_pending=backfill_pending,
    )
    await redis.set(cache_key, response.model_dump_json(), ex=SEARCH_CACHE_TTL)

    asyncio.create_task(
        log_search(
            q=q, media_type=media_type, sort_by=sort_by, page=page, page_size=page_size,
            result_count=total, items_returned=len(summaries),
            tracks_returned=len(track_summaries), backfill_triggered=backfill_pending,
            cache_hit=False, query_embedding_available=query_embedding is not None,
            user_id=current_user.id if current_user else None,
            is_bot=current_user.is_bot if current_user else False,
        )
    )

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id, media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return response


# ── Grouped search ───────────────────────────────────────────────────────


async def search_grouped(
    q: str,
    media_type_limit: int,
    db: AsyncSession,
    current_user: User | None,
) -> StructuredSearchResponse:
    exclude_adult = should_exclude_adult(current_user)

    # Check Redis cache first
    from otix.infrastructure.redis import get_redis
    redis = await get_redis()
    cache_key = _grouped_cache_key(q, media_type_limit, exclude_adult)
    cached = await redis.get(cache_key)
    if cached:
        return StructuredSearchResponse.model_validate_json(cached)

    query_embedding = await _embed_query(q)

    # Run media type searches concurrently — each gets its own DB session since
    # asyncpg sessions aren't safe for concurrent access. The connection pool
    # handles the parallelism fine with pool_size=20.
    async def _search_all_types() -> list[tuple[str, list[MediaItemSummary], int]]:
        async def _search_one(mt: str) -> tuple[str, list[MediaItemSummary], int]:
            async with async_session() as s:
                items, total, _ = await MediaService(s).search_media(
                    query_str=q, media_type=mt, page=1, page_size=media_type_limit,
                    query_embedding=query_embedding, exclude_adult=exclude_adult,
                )
                await enrich_items_with_assets(s, items)
                return mt, [MediaItemSummary.model_validate(i) for i in items], total

        return await asyncio.gather(*[_search_one(mt) for mt in ("movie", "show", "game", "music")])

    async def _search_tracks() -> tuple[list[TrackSearchResult], int]:
        from otix.domain.media import Track
        async with async_session() as s:
            count_q = select(func.count(Track.id)).where(Track.title.ilike(f"%{q}%"))
            total = await s.scalar(count_q) or 0
            tracks = await MediaService(s).search_tracks(query_str=q, limit=20)
            album_items = []
            seen_albums: set[str] = set()
            for t in tracks:
                ai = t.album.media_item
                if ai and ai.id not in seen_albums:
                    seen_albums.add(ai.id)
                    album_items.append(ai)
            await enrich_items_with_assets(s, album_items)
        results = []
        for t in tracks:
            album_item = t.album.media_item
            artist = None
            if album_item.credits:
                ac = next((c for c in album_item.credits if c.role in ("artist", "primary") and c.person), None)
                if ac and ac.person:
                    artist = ac.person.name
            results.append(
                TrackSearchResult(
                    id=t.id, title=t.title, track_number=t.track_number,
                    disc_number=t.disc_number, duration_ms=t.duration_ms,
                    preview_url=t.preview_url,
                    avg_rating=t.avg_rating, rating_count=t.rating_count,
                    album_id=t.album.media_item_id, album_title=album_item.title,
                    album_poster_url=album_item.poster_url, album_artist_name=artist,
                    album_slug=album_item.slug,
                )
            )
        return results, total

    async def _search_people() -> tuple[list[PersonSearchResult], int]:
        from otix.domain.people import Person
        async with async_session() as s:
            count_q = select(func.count(Person.id)).where(Person.name.ilike(f"%{q}%"), Person.embedding.isnot(None))
            total = await s.scalar(count_q) or 0
            people = await PeopleService(s).search_people(query_str=q, limit=10, query_embedding=query_embedding)
            return [PersonSearchResult.model_validate(p) for p in people], total

    async def _search_users() -> tuple[list, int]:
        async with async_session() as s:
            count_q = select(func.count(User.id)).where(
                User.username.ilike(f"%{q}%"), User.is_active == True, User.embedding.isnot(None),
            )
            total = await s.scalar(count_q) or 0
            from otix.schemas.user import UserSearchResult as UserSearchSchema
            fts_stmt = select(User.id).where(
                User.username.ilike(f"%{q}%"), User.is_active == True, User.embedding.isnot(None),
            )
            branches = [fts_stmt]
            if query_embedding:
                branches.append(
                    select(User.id).where(User.is_active == True, User.embedding.isnot(None))
                    .order_by(User.embedding.cosine_distance(query_embedding)).limit(10)
                )
            matched_ids = union(*branches).subquery()
            stmt = select(User).where(
                User.id.in_(select(matched_ids)), User.is_active == True, User.embedding.isnot(None),
            )
            sim = func.similarity(User.username, q)
            vector_sim = (
                func.coalesce(1 - User.embedding.cosine_distance(query_embedding), 0)
                if query_embedding
                else 0
            )
            result = await s.scalars(stmt.order_by((sim * 5 + vector_sim * 5).desc()).limit(10))
            items = []
            for user in result:
                g = compute_level_info(user.total_xp)
                items.append(UserSearchSchema(
                    id=user.id, username=user.username, avatar_url=user.avatar_url,
                    bio=user.bio, level=g["level"], level_title=g["level_title"], is_admin=user.is_admin,
                ))
            return items, total

    async def _search_best() -> list[MediaItemSummary]:
        async with async_session() as s:
            items, _, _ = await MediaService(s).search_media(
                query_str=q, media_type=None, page=1, page_size=3,
                query_embedding=query_embedding, exclude_adult=exclude_adult,
            )
            await enrich_items_with_assets(s, items)
            return [MediaItemSummary.model_validate(i) for i in items]

    (type_results, (tracks_list, tracks_count), (people_list, people_count),
     (users_list, users_count), best_media) = await asyncio.gather(
        _search_all_types(), _search_tracks(), _search_people(), _search_users(), _search_best(),
    )

    candidates: list[tuple[Any, int]] = []
    for i, item in enumerate(best_media[:3]):
        candidates.append((item, i))
    for i, item in enumerate(people_list[:2]):
        candidates.append((item, i))
    for i, item in enumerate(users_list[:2]):
        candidates.append((item, i))
    for i, item in enumerate(tracks_list[:2]):
        candidates.append((item, i))

    scored: list[tuple[float, Any]] = []
    seen: set = set()
    for item, pos in candidates:
        mtype = getattr(item, "media_type", "unknown")
        ukey = (mtype, item.id)
        if ukey in seen:
            continue
        seen.add(ukey)
        name = getattr(item, "title", "") or getattr(item, "name", "") or getattr(item, "username", "")
        nl, ql = name.lower().strip(), q.lower().strip()
        score = 10.0 if nl == ql else (5.0 if nl.startswith(ql) else (2.0 if ql in nl else 0))
        score += {"movie": 0.5, "show": 0.5, "game": 0.5, "music": 0.5, "person": 0.3, "user": 0.2}.get(mtype, 0.1)
        score -= pos * 0.1
        scored.append((score, item))
    scored.sort(key=lambda x: x[0], reverse=True)
    best = [item for _, item in scored[:3]]

    grouped: dict = {"movie": [], "show": [], "game": [], "music": []}
    total_all = 0
    counts = {}
    for mt, items, type_total in type_results:
        grouped[mt] = items
        total_all += type_total
        counts[mt] = type_total
    total_all += tracks_count + people_count + users_count

    response = StructuredSearchResponse(
        best_results=best, movies=grouped["movie"], shows=grouped["show"],
        games=grouped["game"], music=grouped["music"],
        tracks=tracks_list, people=people_list, users=users_list,
        total=total_all,
        movies_count=counts.get("movie", 0), shows_count=counts.get("show", 0),
        games_count=counts.get("game", 0), music_count=counts.get("music", 0),
        tracks_count=tracks_count, people_count=people_count, users_count=users_count,
    )
    asyncio.create_task(redis.set(cache_key, response.model_dump_json(), ex=SEARCH_CACHE_TTL))
    return response


# ── Companies search ─────────────────────────────────────────────────────


async def search_companies(
    q: str,
    limit: int,
    db: AsyncSession,
) -> CompanySearchListResponse:
    query_embedding = await _embed_query(q)
    service = CompanyService(db)
    companies = await service.search_companies(query_str=q, limit=limit + 1, query_embedding=query_embedding)
    has_more = len(companies) > limit
    if has_more:
        companies = companies[:limit]
    return CompanySearchListResponse(
        items=[CompanyOut.model_validate(c) for c in companies], has_more=has_more,
    )


# ── Poll search updates ──────────────────────────────────────────────────


async def poll_search_updates(
    q: str,
    media_type: str | None,
    known_ids: str,
    page_size: int,
    db: AsyncSession,
    current_user: User | None,
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    query_hash = _poll_query_hash(q, media_type)
    redis = await _get_redis()
    keys = [f"backfill:{query_hash}:{p}" for p in BACKFILL_POLL_PROVIDERS]
    vals = await redis.mget(keys)
    all_done = all(v is not None for v in vals)

    if all_done:
        return MediaItemListResponse(items=[], has_more=False, total=0, backfill_pending=False)

    query_embedding = await _embed_query(q)
    service = MediaService(db)
    items, total, has_more = await service.search_media(
        query_str=q, media_type=media_type, page=1, page_size=page_size,
        query_embedding=query_embedding, exclude_adult=exclude_adult,
    )

    known = set(known_ids.split(",")) if known_ids else set()
    new_items = [item for item in items if str(item.id) not in known]
    await enrich_items_with_assets(db, new_items)
    summaries = [MediaItemSummary.model_validate(item) for item in new_items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id, media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return MediaItemListResponse(
        items=summaries, has_more=False, total=total, backfill_pending=not all_done,
    )


# ── Search external games ────────────────────────────────────────────────


async def search_external_games(
    q: str,
    limit: int,
    db: AsyncSession,
) -> MediaItemListResponse:
    redis = await _get_redis()
    from otix.providers.igdb.client import IGDBProvider

    provider = IGDBProvider(redis)
    try:
        igdb_results = await provider.search_games(q, limit=limit, fields="id,name,version_parent")
    except Exception:
        logger.exception("igdb_external_search_failed", q=q)
        return MediaItemListResponse(items=[])

    has_base = any(game.get("version_parent") is None for game in igdb_results)
    if has_base:
        igdb_results = [g for g in igdb_results if g.get("version_parent") is None]

    igdb_ids = [str(r["id"]) for r in igdb_results if isinstance(r.get("id"), (int, str))]
    if not igdb_ids:
        return MediaItemListResponse(items=[])

    ext_id_service = ExternalIDService(db)
    existing_ids = await ext_id_service.batch_find_entity_ids("igdb", igdb_ids)

    summaries: list[MediaItemSummary] = []
    if existing_ids:
        entity_ids = [eid for eid in existing_ids.values() if eid]
        if entity_ids:
            media_service = MediaService(db)
            items = await media_service.get_media_items_by_ids(entity_ids)
            await enrich_items_with_assets(db, items)
            summaries = [MediaItemSummary.model_validate(item) for item in items]

    missing_ids = [gid for gid in igdb_ids if gid not in existing_ids]
    if missing_ids:
        query_hash = _poll_query_hash(q, "game")
        dedup_key = f"ext_import:{query_hash}"
        already_triggered = await redis.get(dedup_key)
        if not already_triggered:
            for gid in missing_ids:
                app.send_task("sync.igdb.game", args=[int(gid)])
            await redis.set(dedup_key, "1", ex=120)

    return MediaItemListResponse(
        items=summaries, backfill_pending=bool(missing_ids), has_more=False, total=len(summaries),
    )
