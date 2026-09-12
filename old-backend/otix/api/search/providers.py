"""Multi-provider search functions — no router, just callables for search/router.py."""

from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.search.embedding import _embed_query, _poll_query_hash
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis
from otix.schemas.media import (
    ProviderSearchRequest,
    ProviderSearchResponse,
    ProviderSearchResult,
    SteamGridGame,
    SteamGridSearchRequest,
    SteamGridSearchResponse,
)
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.external_id_service import ExternalIDService
from otix.services.media_service import MediaService

logger = structlog.get_logger()


async def search_providers(
    body: ProviderSearchRequest,
    db: AsyncSession,
    current_user: User | None,
) -> ProviderSearchResponse:
    redis = await get_redis()
    results: list[ProviderSearchResult] = []
    backfill_pending = False

    # 1. Otix catalog
    try:
        media_service = MediaService(db)
        otix_results = await media_service.search_media(
            query_str=body.query, media_type="game", page_size=body.limit,
        )
        otix_items, _, _ = otix_results
        await enrich_items_with_assets(db, otix_items)
        for item in otix_items:
            results.append(
                ProviderSearchResult(
                    provider="otix", id=item.id, title=item.title,
                    poster_url=item.poster_url, slug=item.slug,
                )
            )
    except Exception:
        logger.exception("provider_search_otix_failed", q=body.query)

    # 2. IGDB
    igdb_ids_seen: set[str] = set()
    if settings.igdb_client_id:
        try:
            from otix.providers.igdb.client import IGDBProvider
            provider = IGDBProvider(redis)
            igdb_raw = await provider.search_games(
                body.query, limit=body.limit, fields="id,name,slug,cover.url",
            )
            igdb_ids = [str(r["id"]) for r in igdb_raw if isinstance(r.get("id"), (int, str))]
            existing: dict[str, str | None] = {}
            if igdb_ids:
                ext_id_service = ExternalIDService(db)
                existing = await ext_id_service.batch_find_entity_ids("igdb", igdb_ids)
                imported_entity_ids = [eid for eid in existing.values() if eid]
                if imported_entity_ids:
                    items = await media_service.get_media_items_by_ids(imported_entity_ids)
                    imported_media: dict = {next((gid for gid, eid in existing.items() if eid == item.id), None): item
                                            for item in items}
                missing_ids = [gid for gid in igdb_ids if gid not in existing]
                if missing_ids:
                    query_hash = _poll_query_hash(body.query, "game")
                    dedup_key = f"provider_search:{query_hash}"
                    already = await redis.get(dedup_key)
                    if not already:
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
                cover = g.get("cover")
                poster = str(cover["url"]).replace("t_thumb", "t_cover_big") if cover and isinstance(cover, dict) and cover.get("url") else None
                results.append(
                    ProviderSearchResult(
                        provider="igdb", id=existing.get(gid) or gid, title=name,
                        poster_url=poster, slug=g.get("slug") or "",
                    )
                )
        except Exception:
            logger.exception("provider_search_igdb_failed", q=body.query)

    # 3. SteamGridDB
    if settings.steamgrid_api_key:
        try:
            from otix.providers.steamgrid.client import SteamGridDBProvider
            sg_provider = SteamGridDBProvider(redis)
            for sg_game in (await sg_provider.search_games(body.query))[:body.limit]:
                if sgdb_id := sg_game.get("id"):
                    results.append(
                        ProviderSearchResult(
                            provider="steamgrid", id=str(sgdb_id),
                            title=sg_game.get("name") or body.query,
                            poster_url=None, slug=None,
                        )
                    )
        except Exception:
            logger.exception("provider_search_steamgrid_failed", q=body.query)

    return ProviderSearchResponse(items=results, backfill_pending=backfill_pending)


async def search_steamgrid(
    body: SteamGridSearchRequest,
) -> SteamGridSearchResponse:
    redis = await get_redis()
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
        grid = logo = hero = icon = None
        try:
            gs = await provider.get_grids(int(sgdb_id), dimensions="460x215")
            grid = gs[0].get("url") if gs and isinstance(gs, list) else None
        except Exception:
            pass
        try:
            ls = await provider.get_logos(int(sgdb_id))
            logo = ls[0].get("url") if ls and isinstance(ls, list) else None
        except Exception:
            pass
        try:
            hs = await provider.get_heroes(int(sgdb_id))
            hero = hs[0].get("url") if hs and isinstance(hs, list) else None
        except Exception:
            pass
        try:
            ic = await provider.get_icons(int(sgdb_id))
            icon = ic[0].get("url") if ic and isinstance(ic, list) else None
        except Exception:
            pass
        items.append(SteamGridGame(sgdb_id=int(sgdb_id), name=str(name), grid_url=grid, logo_url=logo, hero_url=hero, icon_url=icon))

    return SteamGridSearchResponse(items=items)
