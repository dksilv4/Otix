from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
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
    limit: int = Query(6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    """Get hero section media items for the discover page."""
    ip = request.client.host if request.client else None
    exclude_adult = should_exclude_adult(current_user)
    cache_key = f"discover:hero:{limit}:adult{0 if exclude_adult else 1}"
    cached = await _cache_get(cache_key)
    if cached:
        logger.info("discover hero cache hit", ip=ip)
        return MediaItemListResponse.model_validate(json.loads(cached))

    service = MediaService(db)
    items, has_more, _ = await service.list_media(
        has_artwork=True,
        limit=limit,
        exclude_adult=exclude_adult,
    )
    response = await _build_response(db, items, has_more, current_user)
    await _cache_set(cache_key, response.model_dump_json(), ex=_DISCOVER_TTL)

    logger.info("discover hero fetched", count=len(items), ip=ip)
    return response
