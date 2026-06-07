from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.api.discover.router_helpers import _cache_get, _cache_set
from otix.domain.user import User
from otix.schemas.discover import PersonalizedSectionsResponse
from otix.services.personalization_service import PersonalizationService

logger = structlog.get_logger()

router = APIRouter()

_SECTIONS_TTL = 30


@router.get("/sections", response_model=PersonalizedSectionsResponse)
async def discover_sections(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> PersonalizedSectionsResponse:
    """Get personalized discover sections for the current user."""
    ip = request.client.host if request.client else None
    uid = current_user.id if current_user else "anon"
    cache_key = f"discover:sections:{uid}"
    cached = await _cache_get(cache_key)
    if cached:
        logger.info("discover sections cache hit", user_id=uid, ip=ip)
        return PersonalizedSectionsResponse.model_validate(json.loads(cached))

    if current_user:
        service = PersonalizationService(db)
        profile = await service.compute_profile(current_user)
        sections = service.generate_sections(profile, user=current_user)
    else:
        sections = PersonalizationService.default_sections()

    response = PersonalizedSectionsResponse(sections=sections)
    await _cache_set(cache_key, response.model_dump_json(), ex=_SECTIONS_TTL)

    logger.info("discover sections fetched", user_id=uid, ip=ip)
    return response
