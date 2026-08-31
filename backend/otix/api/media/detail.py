# TODO: Review this file
from __future__ import annotations

import asyncio
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.exceptions import BusyLoadingError
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import (
    get_db,
    get_optional_user,
    resolve_country_code,
    resolve_preferred_lang,
    resolve_theme,
)
from otix.api.ttl import TTL
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.schemas.interaction import UserInteractionState
from otix.schemas.media import (
    MediaItemDetail,
    MediaWatchProviderOut,
    WatchProviderOut,
)
from otix.services.admin_edit_service import AdminEditService
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService
from otix.services.plex_sync_service import get_user_plex_item
from otix.services.rating_algorithm_service import compute_overall_rating
from otix.services.steam_library_service import get_steam_playtime

logger = structlog.get_logger()

media_router = APIRouter()

def _media_cache_key(media_id: str, country_code: str, lang: str = "en", theme: str = "dark") -> str:
    # Theme scopes the cached detail so light/dark users don't share a logo pick.
    return f"media:detail:{media_id}:{country_code}:{lang}:{theme}"


async def _patch_user_detail(
    result: MediaItemDetail,
    db: AsyncSession,
    current_user: User,
    media_id: str,
) -> None:
    """Load and apply user-specific fields onto a cached/public MediaItemDetail."""
    interaction_service = InteractionService(db)

    # Launch all independent user-specific lookups concurrently
    interactions_future = asyncio.ensure_future(interaction_service.get_user_interactions(current_user.id, media_id))
    youtube_future = asyncio.ensure_future(interaction_service.get_youtube_liked_interaction(current_user.id, media_id))
    steam_future: asyncio.Task | None = None
    if result.game:
        steam_future = asyncio.ensure_future(get_steam_playtime(db, current_user.id, media_id))
    overrides_future = asyncio.ensure_future(AdminEditService(db).get_image_overrides_for_media(media_id))
    plex_future = asyncio.ensure_future(get_user_plex_item(db, current_user.id, media_id))

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
        result.watch_providers.append(
            MediaWatchProviderOut(
                id=f"plex-{media_id}",
                watch_provider=WatchProviderOut(
                    id="plex",
                    name="Plex",
                    slug="plex",
                    logo_url=None,
                ),
                country_code="",
                offering_type="personal",
                url=f"/api/integrations/plex/stream/{plex_item.rating_key}",
                display_priority=-1,
            )
        )


@media_router.get("/{media_type}/{media_id}", response_model=MediaItemDetail)
async def get_media_item(
    media_type: str,
    media_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    theme: str = Depends(resolve_theme),
) -> MediaItemDetail:
    country_code = await resolve_country_code(request, current_user)
    preferred_lang = await resolve_preferred_lang(request, current_user)
    cache_key = _media_cache_key(media_id, country_code, preferred_lang, theme)
    redis = await get_redis()

    # Cache hit: serve cached public response, patch user data if authenticated
    cached = None
    try:
        cached = await redis.get(cache_key)
    except (BusyLoadingError, RedisConnectionError, OSError):
        pass  # Redis unavailable — fall through to cold DB path
    if cached:
        result = MediaItemDetail.model_validate(json.loads(cached))
        # Safety net: filter stale credits whose person was deleted after caching
        result.credits = [c for c in result.credits if c.person is not None]
        asyncio.create_task(MediaService.increment_view_count(media_id))
        if current_user is not None:
            await _patch_user_detail(result, db, current_user, media_id)
        return result

    # Cold path: full DB load
    asyncio.create_task(MediaService.increment_view_count(media_id))

    service = MediaService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    # Filter out credits whose person record no longer exists (data integrity safety net).
    # The selectinload + joinedload produces a LEFT JOIN — if the person was deleted,
    # credit.person is None, which would fail serialization and create stale links.
    item.credits = [c for c in item.credits if c.person is not None]

    # Resolve asset URLs at query time for the item and any collection movies
    # (their MediaItems are separate ORM objects, loaded by get_media_item).
    collection_media: list = []
    if item.movie is not None and item.movie.collection is not None:
        collection_media = [
            m.media_item for m in item.movie.collection.movies if m.media_item is not None
        ]
    await enrich_items_with_assets(
        db, [item] + collection_media, preferred_lang=preferred_lang, theme=theme
    )

    # Auto-trigger background full hydration if item is incomplete / stub-seeded
    if item.completeness_score is None or item.completeness_score < 0.5 or not item.logo_url:
        try:
            from otix.infrastructure.celery import app
            ext_id_val = None
            if item.media_type == "game":
                ext = next((e for e in item.external_ids if e.provider == "igdb"), None)
                if ext:
                    ext_id_val = ext.external_id
            elif item.media_type in ("movie", "show"):
                ext = next((e for e in item.external_ids if e.provider == "tmdb"), None)
                if ext:
                    ext_id_val = ext.external_id
            if ext_id_val:
                app.send_task("sync.media.fully_process", args=[item.media_type, ext_id_val])
        except Exception:
            pass

    result = MediaItemDetail.model_validate(item)

    # Surface the TMDB external id (movie/show) so desktop integrations like
    # the Radarr request button can address the item on the source service.
    for ext in item.external_ids:
        if ext.provider == "tmdb" and ext.external_id:
            result.tmdb_id = ext.external_id
            break

    # Populate screenshots from assets (filter screenshot type, sort by score desc)
    from otix.schemas.admin_edit import MediaAssetOut

    result.screenshots = sorted(
        (MediaAssetOut.model_validate(a) for a in item.assets if a.asset_type == "screenshot"),
        key=lambda s: s.score or 0,
        reverse=True,
    )

    # Compute the blended overall rating if not yet cached on the model
    if result.overall_rating is None:
        overall_rating, overall_source = await compute_overall_rating(db, media_id)
        result.overall_rating = overall_rating
        result.overall_rating_source = overall_source

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
    try:
        await redis.set(cache_key, json.dumps(response_data), ex=TTL["MEDIA"]["DETAIL"])
    except (BusyLoadingError, RedisConnectionError, OSError):
        pass  # Redis unavailable — skip caching, serve uncached

    # Patch user-specific data before returning
    if current_user is not None:
        await _patch_user_detail(result, db, current_user, media_id)

    return result
