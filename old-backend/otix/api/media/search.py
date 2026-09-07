"""Media browsing, game matching, rehydration, import, and sync endpoints.

This file handles everything that lives under /media/ that isn't search
functionality. Search-specific endpoints moved to otix/api/search/.
"""

from __future__ import annotations

import asyncio
import time
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.api.deps import (
    get_current_admin_user,
    get_current_user,
    get_db,
    get_optional_user,
    resolve_country_code,
)
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.media_rehydrate_progress import channel_name, get_latest_progress, get_stored_result
from otix.lib.sse import SseStreamConfig, create_sse_response
from otix.schemas.interaction import UserInteractionState
from otix.schemas.media import (
    ConfirmMatchRequest,
    ConfirmMatchResponse,
    GameMatchBatchRequest,
    GameMatchBatchResponse,
    GameMatchRequest,
    GameMatchResponse,
    GenreOut,
    ImportGameResponse,
    MediaImportRequest,
    MediaImportResponse,
    MediaItemListResponse,
    MediaItemSummary,
    StreamCompleteEvent,
    StreamMatchEvent,
    SyncLocalGamesRequest,
    SyncLocalGamesResponse,
    CompanyOut,
)
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.external_id_service import ExternalIDService
from otix.services.game_matcher import GameMatcher
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult

logger = structlog.get_logger()

media_router = APIRouter()


# ── List / browse media (GET /media/) ────────────────────────────────


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
    await enrich_items_with_assets(db, items)
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if sort_by in ("revenue", "budget", "profit"):
        for i, summary in enumerate(summaries):
            movie = items[i].movie if items[i].movie else None
            if movie:
                summary.revenue = movie.revenue
                summary.budget = movie.budget

    rg_future = None
    interactions_future = None

    if media_type == "music":
        album_media_ids = [item.id for item in items if item.album]
        if album_media_ids:
            rg_future = asyncio.ensure_future(
                ExternalIDService(db).batch_find_by_entity_ids("media_item", album_media_ids)
            )

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        interactions_future = asyncio.ensure_future(
            interaction_service.get_batch_interactions(
                user_id=current_user.id, media_item_ids=[s.id for s in summaries],
            )
        )

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

    if interactions_future is not None:
        batch = await interactions_future
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return MediaItemListResponse(
        items=summaries, next_cursor=next_cursor, has_more=has_more, total=total,
    )


# ── Genres (GET /media/genres) ────────────────────────────────────────


@media_router.get("/genres", response_model=list[GenreOut])
async def list_genres(
    media_type: str | None = Query(None, description="Filter genres to a specific media type"),
    db: AsyncSession = Depends(get_db),
) -> list[GenreOut]:
    service = MediaService(db)
    genres = await service.list_genres(media_type)
    return [GenreOut.model_validate(g) for g in genres]


# ── Company lookup (GET /media/company) ────────────────────────────────


@media_router.get("/company", response_model=CompanyOut)
async def get_company_by_slug(
    slug: str = Query(None, description="Company slug (deprecated, use /company/{id})"),
    id: str = Query(None, description="Company ID"),
    db: AsyncSession = Depends(get_db),
) -> CompanyOut:
    if not id and not slug:
        raise HTTPException(status_code=400, detail="Provide id or slug")
    from otix.services.company_service import CompanyService
    result = await CompanyService.get_by_id_or_slug(db, id=id, slug=slug)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyOut.model_validate(result)


# ── Certifications (GET /media/certifications) ────────────────────────


@media_router.get("/certifications", response_model=list[str])
async def list_certifications(
    media_type: str | None = Query(None, description="Filter certifications to a specific media type"),
    country_code: str = Query("us", description="Country code for certification ratings (e.g. 'us', 'gb')"),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    service = MediaService(db)
    return await service.list_certifications(country_code=country_code, media_type=media_type)


# ── Game matching ─────────────────────────────────────────────────────


@media_router.post("/match", response_model=GameMatchResponse)
async def match_game(
    body: GameMatchRequest,
    db: AsyncSession = Depends(get_db),
) -> GameMatchResponse:
    """Match a single game against the Otix catalog."""
    redis = await get_redis()
    from otix.providers.steamgrid.client import SteamGridDBProvider

    matcher = GameMatcher(db, redis, SteamGridDBProvider(redis))
    return await matcher.match_single(body)


@media_router.post("/match/batch", response_model=GameMatchBatchResponse)
async def match_games_batch(
    body: GameMatchBatchRequest,
    db: AsyncSession = Depends(get_db),
) -> GameMatchBatchResponse:
    """Match multiple games in a single batch call."""
    redis = await get_redis()
    from otix.providers.steamgrid.client import SteamGridDBProvider

    matcher = GameMatcher(db, redis, SteamGridDBProvider(redis))
    matches = await matcher.match_batch(body.games)

    for req, response in zip(body.games, matches):
        seen = set()
        candidates = []
        if response.auto_match:
            candidates.append(response.auto_match)
        for c in response.candidates:
            if c.media_item_id and c.confidence >= 0.85 and c.media_item_id not in seen:
                candidates.append(c)
                seen.add(c.media_item_id)
        for candidate in candidates:
            if candidate.confidence >= 0.70:
                try:
                    await matcher._create_match_proposal(req, candidate)
                except Exception:
                    pass

    return GameMatchBatchResponse(matches=matches)


@media_router.post("/match/stream")
async def match_games_stream(
    body: GameMatchBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> StreamingResponse:
    """SSE stream of per-game match progress for the desktop orchestrator."""
    redis = await get_redis()
    from otix.providers.steamgrid.client import SteamGridDBProvider

    matcher = GameMatcher(db, redis, SteamGridDBProvider(redis))
    return StreamingResponse(
        matcher.match_batch_stream(body.games),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@media_router.post("/match/scan")
async def match_scan(
    body: GameMatchBatchRequest,
    hydrate: bool = Query(True, description="Include full MediaItem detail for auto-matched games"),
    seed_missing: bool = Query(True, description="Fire background import tasks for unmatched/needs-import games"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> StreamingResponse:
    """Unified match+hydrate+seed endpoint (SSE stream)."""
    redis = await get_redis()
    from otix.providers.steamgrid.client import SteamGridDBProvider

    matcher = GameMatcher(db, redis, SteamGridDBProvider(redis))
    media_type = body.games[0].media_type if body.games else "game"
    results = await matcher.match_batch(body.games, media_type=media_type)

    start = time.monotonic()
    n = len(results)
    matched_count = 0
    unmatched_count = 0
    errored_count = 0

    async def _generate():
        nonlocal matched_count, unmatched_count, errored_count
        for i, (req, response) in enumerate(zip(body.games, results)):
            try:
                has_match = response.auto_match is not None or bool(response.candidates)
                status = "matched" if has_match else "unmatched"
                if has_match:
                    matched_count += 1
                else:
                    unmatched_count += 1

                hydrated = None
                if hydrate and response.auto_match and response.auto_match.media_item_id:
                    try:
                        from otix.domain.company import InvolvedCompany

                        stmt = (
                            select(MediaItem)
                            .where(MediaItem.id == response.auto_match.media_item_id)
                            .options(
                                selectinload(MediaItem.genres),
                                selectinload(MediaItem.involved_companies).selectinload(InvolvedCompany.company),
                                selectinload(MediaItem.game_modes),
                                selectinload(MediaItem.platforms),
                                selectinload(MediaItem.screenshots),
                                selectinload(MediaItem.external_ids),
                            )
                        )
                        row = await db.execute(stmt)
                        mi = row.scalars().first()
                        if mi:
                            await enrich_items_with_assets(db, [mi])
                            hydrated = {
                                "id": mi.id, "title": mi.title, "slug": mi.slug,
                                "poster_url": mi.poster_url, "backdrop_url": mi.backdrop_url,
                                "logo_url": mi.logo_url, "icon_url": mi.icon_url,
                                "textless_poster_url": mi.textless_poster_url,
                                "release_date": mi.release_date.isoformat() if mi.release_date else None,
                                "overview": mi.overview,
                                "avg_rating": float(mi.avg_rating) if mi.avg_rating else None,
                                "rating_count": mi.rating_count, "is_free": mi.is_free,
                                "has_multiplayer": mi.has_multiplayer,
                                "genres": [{"id": g.genre.id, "name": g.genre.name, "slug": g.genre.slug}
                                           for g in (mi.genres or []) if g.genre],
                                "involved_companies": [
                                    {"company": {"id": ic.company.id, "name": ic.company.name, "slug": ic.company.slug,
                                                 "logo_url": ic.company.logo_url},
                                     "developer": ic.developer, "publisher": ic.publisher}
                                    for ic in (mi.involved_companies or [])],
                                "game_modes": [{"id": gm.game_mode.id, "name": gm.game_mode.name, "slug": gm.game_mode.slug}
                                               for gm in (mi.game_modes or []) if gm.game_mode],
                                "platforms": [{"id": p.platform.id, "name": p.platform.name, "slug": p.platform.slug}
                                              for p in (mi.platforms or []) if p.platform],
                                "screenshots": [{"url": s.url, "width": s.width, "height": s.height}
                                                for s in (mi.screenshots or [])],
                                "steam_app_id": mi.steam_app_id,
                                "steam_playtime_forever": mi.steam_playtime_forever,
                                "steam_playtime_2weeks": mi.steam_playtime_2weeks,
                                "website": mi.website,
                            }
                    except Exception:
                        logger.exception("hydrate_failed", media_item_id=response.auto_match.media_item_id)

                if seed_missing:
                    if response.auto_match and response.auto_match.needs_import and response.auto_match.provider_id:
                        _fire_import_task(response.auto_match, media_type)
                    elif not response.auto_match and not response.candidates:
                        if media_type == "game":
                            _fire_title_seed(req)

                proposal_status = None
                if response.auto_match and response.auto_match.media_item_id:
                    proposal_status = await matcher._create_match_proposal(req, response.auto_match)

                yield (
                    f"event: game-progress\n"
                    f"data: {
                        StreamMatchEvent(
                            game_index=i, total_games=n,
                            query_id=req.query_id, query_title=req.title,
                            status=status, candidates_count=len(response.candidates),
                            auto_match=response.auto_match is not None,
                            match=response.auto_match, candidates=response.candidates if response.candidates else None,
                            hydrated=hydrated, proposal_status=proposal_status,
                        ).model_dump_json()
                    }\n\n"
                )
            except Exception as exc:
                errored_count += 1
                logger.exception("match_scan_error", title=req.title)
                try:
                    await db.rollback()
                except Exception:
                    pass
                yield (
                    f"event: game-progress\n"
                    f"data: {
                        StreamMatchEvent(
                            game_index=i, total_games=n,
                            query_id=req.query_id, query_title=req.title,
                            status='error', error=str(exc),
                        ).model_dump_json()
                    }\n\n"
                )

        duration_ms = int((time.monotonic() - start) * 1000)
        yield (
            f"event: complete\n"
            f"data: {
                StreamCompleteEvent(
                    total_games=n, matched_count=matched_count,
                    unmatched_count=unmatched_count, errored_count=errored_count,
                    duration_ms=duration_ms,
                ).model_dump_json()
            }\n\n"
        )

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _fire_import_task(candidate, media_type: str = "game") -> None:
    try:
        provider = candidate.provider or "igdb"
        provider_id = candidate.provider_id
        if provider == "igdb" and provider_id:
            app.send_task("sync.igdb.game", args=[int(provider_id)], priority=9)
            logger.info("seed_import_fired", provider=provider, provider_id=provider_id)
    except Exception:
        logger.exception("seed_import_failed", provider=candidate.provider, provider_id=candidate.provider_id)


def _fire_title_seed(request) -> None:
    try:
        payload = [{"title": request.title, "platform": request.platforms[0] if request.platforms else None}]
        app.send_task("seed.igdb_from_titles", args=[payload])
        logger.info("seed_title_fired", title=request.title)
    except Exception:
        logger.exception("seed_title_failed", title=request.title)


@media_router.post("/match/confirm", response_model=ConfirmMatchResponse)
async def confirm_match(
    body: ConfirmMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConfirmMatchResponse:
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
    from otix.services.match_confirmation import MatchConfirmationService

    svc = MatchConfirmationService(db)
    result = await svc.unlink(query_id)
    await db.commit()
    return result


# ── Rehydration ────────────────────────────────────────────────────────


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
    return await create_sse_response(
        SseStreamConfig(
            channel=channel_name(task_id),
            terminal_events=("rehydrate_complete", "error"),
            result_replay=lambda: get_stored_result(task_id),
            progress_replay=lambda: get_latest_progress(task_id),
        ),
        request,
    )


# ── IGDB import ────────────────────────────────────────────────────────


@media_router.post("/import/igdb", response_model=ImportGameResponse)
async def import_igdb_game(
    igdb_id: int = Query(..., description="IGDB game ID to import"),
    current_user: User = Depends(get_current_user),
) -> ImportGameResponse:
    from otix.tasks.sync.igdb import _sync_igdb_game

    try:
        result = await _sync_igdb_game(igdb_id, force=True)
    except Exception:
        logger.exception("igdb_import_failed", igdb_id=igdb_id)
        raise HTTPException(status_code=500, detail="IGDB import failed. Please try again.")

    if result is None:
        async with async_session() as session:
            ext_id = await ExternalIDService(session).get_by_provider_ext_id("igdb", str(igdb_id))
            if ext_id is not None:
                media_id = ext_id.entity_id or ext_id.media_item_id
                if media_id:
                    item = await session.get(MediaItem, media_id)
                    if item is not None:
                        logger.info("igdb_import_returned_existing", igdb_id=igdb_id, media_id=item.id, title=item.title)
                        return ImportGameResponse(media_id=item.id, title=item.title, slug=item.slug)
        raise HTTPException(status_code=404, detail="IGDB game not found or import failed")

    async with async_session() as session:
        item = await session.get(MediaItem, result["otix_id"])
        slug = item.slug if item else ""

    logger.info("igdb_import_success", igdb_id=igdb_id, media_id=result["otix_id"], title=result["title"])
    return ImportGameResponse(media_id=result["otix_id"], title=result["title"], slug=slug)


# ── Generic provider import (POST /media/import) ──────────────────────


_IMPORT_PROVIDERS: set[str] = {
    "tmdb",  # media_type required: movie | show
    "igdb",  # infers media_type "game"
}


@media_router.post("/import", response_model=MediaImportResponse)
async def import_media(
    body: MediaImportRequest,
    current_user: User = Depends(get_current_user),
) -> MediaImportResponse:
    """Import a media item from an external provider (tmdb/igdb) into Otix.

    Used by plugins (e.g. Radarr) to hydrate the backend catalog from a
    provider library. ``provider_id`` is the external id; tmdb also requires
    ``media_type``. Existing external ids short-circuit to the stored item.
    """
    provider = body.provider.lower()
    provider_id = str(body.provider_id)

    if provider not in _IMPORT_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {body.provider}")

    from otix.tasks.sync.tmdb import _resolve_external_id, _sync_tmdb_media
    from otix.tasks.sync.igdb import _sync_igdb_game

    try:
        if provider == "tmdb":
            if body.media_type not in ("movie", "show"):
                raise HTTPException(
                    status_code=400,
                    detail="media_type is required for tmdb imports (movie or show)",
                )
            result = await _sync_tmdb_media(int(provider_id), body.media_type)
        else:
            result = await _sync_igdb_game(int(provider_id), force=True)
    except HTTPException:
        raise
    except Exception:
        logger.exception("media_import_failed", provider=provider, provider_id=provider_id)
        raise HTTPException(status_code=500, detail="Media import failed. Please try again.")

    if result is None:
        async with async_session() as session:
            # TMDB reuses numeric IDs across entity types (movie 19995 vs person
            # 19995), so a bare (provider, external_id) lookup can match the wrong
            # entity. Resolve exactly like _sync_tmdb_media does: entity_type +
            # media_type. Without this, a short-circuited import of a movie whose
            # ID collides with a person/company row 404s (or worse, returns the
            # wrong item).
            if provider == "tmdb":
                item, _ = await _resolve_external_id(session, provider_id, body.media_type)
            else:
                ext_id = await ExternalIDService(session).get_by_provider_ext_id(provider, provider_id, entity_type="media_item")
                media_id = ext_id.entity_id or ext_id.media_item_id if ext_id else None
                item = await session.get(MediaItem, media_id) if media_id else None
            if item is not None:
                logger.info("media_import_returned_existing", provider=provider, provider_id=provider_id, media_id=item.id, title=item.title)
                return MediaImportResponse(
                    media_id=item.id, title=item.title, slug=item.slug,
                    provider=provider, provider_id=provider_id,
                )
        raise HTTPException(status_code=404, detail="Media not found or import failed")

    async with async_session() as session:
        item = await session.get(MediaItem, result["otix_id"])
        slug = item.slug if item else ""

    logger.info("media_import_success", provider=provider, provider_id=provider_id, media_id=result["otix_id"], title=result["title"])
    return MediaImportResponse(
        media_id=result["otix_id"], title=result["title"], slug=slug,
        provider=provider, provider_id=provider_id,
    )


# ── Sync local games ──────────────────────────────────────────────────


@media_router.post("/sync-local-games", response_model=SyncLocalGamesResponse)
async def sync_local_games(
    body: SyncLocalGamesRequest,
    current_user: User = Depends(get_optional_user),
) -> SyncLocalGamesResponse:
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    from otix.domain.media import UserLocalGame

    async with async_session() as session:
        user_id = current_user.id
        upserted = 0
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
                existing_game.media_item_id = game.otix_media_id or existing_game.media_item_id
                existing_game.match_suggestion_media_id = (
                    game.match_suggestion_media_id or existing_game.match_suggestion_media_id
                )
                existing_game.last_seen_at = func.now()
            else:
                new_game = UserLocalGame(
                    user_id=user_id, title=game.title, platform=game.platform,
                    media_item_id=game.otix_media_id, match_suggestion_media_id=game.match_suggestion_media_id,
                )
                session.add(new_game)
            upserted += 1

        deleted = 0
        for key, existing_game in existing_by_key.items():
            if key not in incoming_keys:
                await session.delete(existing_game)
                deleted += 1

        from otix.services.interaction_service import InteractionService
        interaction_svc = InteractionService(session)
        for game in body.games:
            if game.otix_media_id:
                try:
                    await interaction_svc.set_interaction(
                        user_id=user_id, media_item_id=game.otix_media_id, interaction_type="owned",
                    )
                except Exception:
                    pass

        await session.commit()

    logger.info("sync_local_games_complete", user_id=user_id, upserted=upserted, deleted=deleted)
    return SyncLocalGamesResponse(upserted=upserted, deleted=deleted)
