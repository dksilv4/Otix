from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.discover.router_helpers import _build_response, _cache_get, _cache_set
from otix.domain.user import User
from otix.schemas.media import MediaItemListResponse
from otix.services.media_service import MediaService, should_exclude_adult

logger = structlog.get_logger()

router = APIRouter()

_DISCOVER_TTL = 120


@router.get("/hero", response_model=MediaItemListResponse)
async def discover_hero(
    request: Request,
    limit: int = Query(9, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    """Get hero section media items for the discover page."""
    import random

    ip = request.client.host if request.client else None
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"discover:hero:{limit}:adult{0 if exclude_adult else 1}"
    cached = await _cache_get(cache_key)
    if cached:
        logger.info("discover hero cache hit", ip=ip)
        return MediaItemListResponse.model_validate(json.loads(cached))

    service = MediaService(db)
    # Fetch a larger pool so we can show variety instead of the same items every time
    pool_size = min(limit * 4, 50)
    items, _, _ = await service.list_media(
        has_artwork=True,
        limit=pool_size,
        exclude_adult=exclude_adult,
    )
    random.shuffle(items)
    items = items[:limit]

    response = await _build_response(db, items, False, current_user)
    response.next_cursor = None
    await _cache_set(cache_key, response.model_dump_json(), ex=_DISCOVER_TTL)

    logger.info("discover hero fetched", count=len(items), pool_size=pool_size, ip=ip)
    return response
