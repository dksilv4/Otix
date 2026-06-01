from __future__ import annotations

import hashlib
import json

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import MediaItemListResponse, MediaItemSummary
from otix.api.schemas.discover import PersonalizedSectionsResponse
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService, should_exclude_adult
from otix.services.personalization_service import PersonalizationService

discover_router = APIRouter(prefix="/discover", tags=["discover"])

_DISCOVER_TTL = 120  # non-personalized lists (hero, trending, popular, etc.)
_PERSONALIZED_TTL = 15  # collaborative, semantic, integration_*
_SECTIONS_TTL = 30  # personalized sections


async def _cache_get(key: str) -> str | None:
    """Redis GET with failure tolerance — returns None on any error."""
    try:
        redis = await get_redis()
        return await redis.get(key)
    except Exception:
        return None


async def _cache_set(key: str, value: str, ex: int) -> None:
    """Redis SET with failure tolerance — swallows errors silently."""
    try:
        redis = await get_redis()
        await redis.set(key, value, ex=ex)
    except Exception:
        pass


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

# (list_type) → (sort_by, sort_dir, date_filter)
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


async def _build_response(
    db: AsyncSession,
    items: list,
    has_more: bool,
    current_user: User | None,
) -> MediaItemListResponse:
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
    )


@discover_router.get("/hero", response_model=MediaItemListResponse)
async def discover_hero(
    limit: int = Query(6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"discover:hero:{limit}:adult{0 if exclude_adult else 1}"
    cached = await _cache_get(cache_key)
    if cached:
        return MediaItemListResponse.model_validate(json.loads(cached))

    service = MediaService(db)
    items, has_more, _ = await service.list_media(
        has_artwork=True,
        limit=limit,
        exclude_adult=exclude_adult,
    )
    response = await _build_response(db, items, has_more, current_user)
    await _cache_set(cache_key, response.model_dump_json(), ex=_DISCOVER_TTL)
    return response


@discover_router.get("/sections", response_model=PersonalizedSectionsResponse)
async def discover_sections(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> PersonalizedSectionsResponse:
    uid = current_user.id if current_user else "anon"
    cache_key = f"discover:sections:{uid}"
    cached = await _cache_get(cache_key)
    if cached:
        return PersonalizedSectionsResponse.model_validate(json.loads(cached))

    if current_user:
        service = PersonalizationService(db)
        profile = await service.compute_profile(current_user)
        sections = service.generate_sections(profile, user=current_user)
    else:
        sections = PersonalizationService.default_sections()

    response = PersonalizedSectionsResponse(sections=sections)
    await _cache_set(cache_key, response.model_dump_json(), ex=_SECTIONS_TTL)
    return response


@discover_router.get("/{media_type}/{list_type}", response_model=MediaItemListResponse)
async def discover_list(
    media_type: str,
    list_type: str,
    genre: str | None = Query(None, description="Genre slug"),
    language: str | None = Query(None, description="Language code (e.g. 'ja', 'ko')"),
    is_anime: bool | None = Query(None, description="Filter to anime (movie/show only)"),
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    if media_type not in VALID_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid media_type: {media_type}")
    if list_type not in VALID_LIST_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid list_type: {list_type}")

    # Normalize regional language variants to ISO 639-1 for content filtering
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
        return MediaItemListResponse.model_validate(json.loads(cached))

    service = MediaService(db)

    # Collaborative: seed from similar users' interactions
    if list_type == "collaborative" and current_user:
        personalization = PersonalizationService(db)
        similar = await personalization._find_similar_users(current_user)
        seed_ids = await personalization._get_collaborative_items(
            current_user.id, similar, media_type, limit=50,
        )
        if seed_ids:
            items, has_more, _ = await service.list_media(
                media_type=media_type,
                sort_by="popularity",
                sort_dir="desc",
                limit=limit,
                media_ids=seed_ids,
                exclude_adult=exclude_adult,
            )
            response = await _build_response(db, items, has_more, current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            return response

    # Semantic: seed from user's content embedding centroid
    if list_type == "semantic" and current_user:
        personalization = PersonalizationService(db)
        seed_ids = await personalization.get_semantic_recommendations(
            current_user.id, media_type, limit=limit, exclude_adult=exclude_adult,
        )
        if seed_ids:
            items = await service.get_media_items_by_ids(seed_ids[:limit])
            response = await _build_response(db, items, has_more=False, current_user=current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            return response

    # Integration: seed from connected platform data
    if list_type == "integration_steam" and current_user and current_user.steam_id:
        seed_query = (
            "SELECT usg.media_item_id FROM user_steam_games usg "
            "WHERE usg.user_id = :user_id AND usg.media_item_id IS NOT NULL "
            "ORDER BY usg.playtime_forever DESC LIMIT :limit"
        )
        result = await db.execute(text(seed_query), {"user_id": current_user.id, "limit": limit * 2})
        seed_ids = [row[0] for row in result.fetchall()]
        if seed_ids:
            items, has_more, _ = await service.list_media(
                media_type=media_type,
                sort_by="popularity",
                sort_dir="desc",
                limit=limit,
                media_ids=seed_ids,
                exclude_adult=exclude_adult,
            )
            response = await _build_response(db, items, has_more, current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            return response

    if list_type == "integration_plex" and current_user and current_user.plex_id:
        seed_query = (
            "SELECT upi.media_item_id FROM user_plex_items upi "
            "WHERE upi.user_id = :user_id AND upi.media_item_id IS NOT NULL "
            "ORDER BY upi.view_count DESC LIMIT :limit"
        )
        result = await db.execute(text(seed_query), {"user_id": current_user.id, "limit": limit * 2})
        seed_ids = [row[0] for row in result.fetchall()]
        if seed_ids:
            items, has_more, _ = await service.list_media(
                media_type=media_type,
                sort_by="popularity",
                sort_dir="desc",
                limit=limit,
                media_ids=seed_ids,
                exclude_adult=exclude_adult,
            )
            response = await _build_response(db, items, has_more, current_user)
            await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
            return response

    if list_type not in _LIST_CONFIG:
        # Non-standard list types (semantic, collaborative, integration_*) that
        # require auth — fall back to trending when unauthenticated
        list_type = "trending"
    sort_by, sort_dir, date_filter_name = _LIST_CONFIG[list_type]
    date_from, date_to = _date_filter(date_filter_name)

    # Require artwork only for broad/generic queries. Language and anime
    # filters target niche content where artwork coverage is sparser.
    require_artwork = not (language or is_anime is not None)

    items, has_more, _ = await service.list_media(
        media_type=media_type,
        genre=genre,
        language=language,
        is_anime=is_anime,
        has_artwork=require_artwork,
        sort_by=sort_by,
        sort_dir=sort_dir,
        cursor=cursor,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        exclude_adult=exclude_adult,
    )
    response = await _build_response(db, items, has_more, current_user)
    await _cache_set(cache_key, response.model_dump_json(), ex=cache_ttl)
    return response
