from __future__ import annotations

import hashlib
import json
from datetime import date, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.api.discover.router_helpers import _build_response, _cache_get, _cache_set
from otix.domain.user import User
from otix.schemas.media import MediaItemListResponse
from otix.services.media_service import MediaService, should_exclude_adult
from otix.services.personalization_service import PersonalizationService
from otix.services.plex_sync_service import get_plex_seed_ids
from otix.services.steam_library_service import get_steam_game_seed_ids

logger = structlog.get_logger()

router = APIRouter()

_PERSONALIZED_TTL = 15
_DISCOVER_TTL = 120

VALID_MEDIA_TYPES = {"movie", "show", "game", "music"}
VALID_LIST_TYPES = {
    "trending",
    "popular",
    "top_rated",
    "upcoming",
    "now_playing",
    "collaborative",
    "semantic",
    "integration_steam",
    "integration_plex",
}

_LIST_CONFIG: dict[str, tuple[str, str, str | None]] = {
    "trending": ("popularity", "desc", None),
    "popular": ("popularity", "desc", None),
    "top_rated": ("rating", "desc", None),
    "upcoming": ("release_date", "asc", "future"),
    "now_playing": ("popularity", "desc", "recent"),
    "collaborative": ("popularity", "desc", None),
    "integration_steam": ("popularity", "desc", None),
    "integration_plex": ("popularity", "desc", None),
}


def _date_filter(name: str | None) -> tuple[date | None, date | None]:
    today = date.today()
    if name == "future":
        return (today, None)
    if name == "recent":
        return (today - timedelta(days=90), None)
    return (None, None)


@router.get("/{media_type}/{list_type}", response_model=MediaItemListResponse)
async def discover_list(
    media_type: str,
    list_type: str,
    request: Request,
    genre: str | None = Query(None, description="Genre slug"),
    language: str | None = Query(None, description="Language code"),
    is_anime: bool | None = Query(None, description="Filter to anime"),
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    """Get a paginated list of media items for a given media type and list type."""
    ip = request.client.host if request.client else None

    if media_type not in VALID_MEDIA_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid media_type: {media_type}")
    if list_type not in VALID_LIST_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid list_type: {list_type}")

    if language and len(language) > 2:
        language = language.split("-")[0]

    exclude_adult = should_exclude_adult(current_user)
    is_personalized = list_type in ("collaborative", "semantic", "integration_steam", "integration_plex")
    cache_ttl = _PERSONALIZED_TTL if is_personalized else _DISCOVER_TTL
    uid = current_user.id if current_user else "anon"

    if is_personalized:
        raw = f"{media_type}:{list_type}:{genre or ''}:{language or ''}:{is_anime}:{cursor or ''}:{limit}:{uid}:adult{0 if exclude_adult else 1}"
    else:
        raw = f"{media_type}:{list_type}:{genre or ''}:{language or ''}:{is_anime}:{cursor or ''}:{limit}:adult{0 if exclude_adult else 1}"
    cache_key = f"discover:list:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"

    cached = await _cache_get(cache_key)
    if cached:
        logger.info("discover list cache hit", media_type=media_type, list_type=list_type, ip=ip)
        return MediaItemListResponse.model_validate(json.loads(cached))

    service = MediaService(db)

    if list_type == "collaborative" and current_user:
        personalization = PersonalizationService(db)
        similar = await personalization._find_similar_users(current_user)
        seed_ids = await personalization._get_collaborative_items(
            current_user.id, similar, media_type, limit=50,
        )
        if seed_ids:
            items, has_more, _ = await service.list_media(
                media_type=media_type, sort_by="popularity", sort_dir="desc",
                limit=limit, media_ids=seed_ids, exclude_adult=exclude_adult,
            )
            response = await _build_response(db, items, has_more, current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            logger.info("discover collaborative fetched", media_type=media_type, ip=ip)
            return response

    if list_type == "semantic" and current_user:
        personalization = PersonalizationService(db)
        seed_ids = await personalization.get_semantic_recommendations(
            current_user.id, media_type, limit=limit, exclude_adult=exclude_adult,
        )
        if seed_ids:
            items = await service.get_media_items_by_ids(seed_ids[:limit])
            response = await _build_response(db, items, has_more=False, current_user=current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            logger.info("discover semantic fetched", media_type=media_type, ip=ip)
            return response

    if list_type == "integration_steam" and current_user and current_user.steam_id:
        seed_ids = await get_steam_game_seed_ids(db, current_user.id, limit=limit * 2)
        if seed_ids:
            items, has_more, _ = await service.list_media(
                media_type=media_type, sort_by="popularity", sort_dir="desc",
                limit=limit, media_ids=seed_ids, exclude_adult=exclude_adult,
            )
            response = await _build_response(db, items, has_more, current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            logger.info("discover steam fetched", media_type=media_type, ip=ip)
            return response

    if list_type == "integration_plex" and current_user and current_user.plex_id:
        seed_ids = await get_plex_seed_ids(db, current_user.id, limit=limit * 2)
        if seed_ids:
            items, has_more, _ = await service.list_media(
                media_type=media_type, sort_by="popularity", sort_dir="desc",
                limit=limit, media_ids=seed_ids, exclude_adult=exclude_adult,
            )
            response = await _build_response(db, items, has_more, current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            logger.info("discover plex fetched", media_type=media_type, ip=ip)
            return response

    if list_type not in _LIST_CONFIG:
        list_type = "trending"
    sort_by, sort_dir, date_filter_name = _LIST_CONFIG[list_type]
    date_from, date_to = _date_filter(date_filter_name)
    require_artwork = not (language or is_anime is not None)

    items, has_more, _ = await service.list_media(
        media_type=media_type, genre=genre, language=language, is_anime=is_anime,
        has_artwork=require_artwork, sort_by=sort_by, sort_dir=sort_dir,
        cursor=cursor, limit=limit, date_from=date_from, date_to=date_to,
        exclude_adult=exclude_adult,
    )
    response = await _build_response(db, items, has_more, current_user)
    await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)

    logger.info("discover list fetched", media_type=media_type, list_type=list_type, count=len(items), ip=ip)
    return response
