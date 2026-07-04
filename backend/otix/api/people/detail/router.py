from __future__ import annotations

import json
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.schemas.people import PersonDetail, PersonListResponse, PersonSummary
from otix.services.people_service import PeopleService

logger = structlog.get_logger()

router = APIRouter()

_PERSON_DETAIL_TTL = 300  # 5 minutes


@router.get("/search", response_model=PersonListResponse)
async def search_people(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PersonListResponse:
    """Search people by name."""
    ip = request.client.host if request.client else None
    service = PeopleService(db)

    try:
        items = await service.search_people(query_str=q, limit=limit)
    except Exception:
        await db.rollback()
        logger.exception("failed to search people", ip=ip)
        raise

    logger.info("people searched", query=q, count=len(items), ip=ip)
    return PersonListResponse(
        items=[PersonSummary.model_validate(item) for item in items],
        has_more=False,
    )


@router.get("/{person_id}", response_model=PersonDetail)
async def get_person(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> PersonDetail:
    """Get detailed information about a person."""
    ip = request.client.host if request.client else None
    service = PeopleService(db)
    user_id = current_user.id if current_user else None
    redis = await get_redis()
    cache_key = f"person:detail:{person_id}"

    # Try cache hit
    cached = None
    try:
        cached = await redis.get(cache_key)
    except Exception:
        pass

    if cached:
        result = PersonDetail.model_validate(json.loads(cached))
        # Patch user-specific follow status and user rating
        if user_id:
            try:
                from sqlalchemy import select
                from otix.domain.people import PersonRating, UserPersonFollow
                
                # Check follow status
                follow = await db.scalar(
                    select(UserPersonFollow).where(
                        UserPersonFollow.user_id == user_id,
                        UserPersonFollow.person_id == person_id,
                    )
                )
                result.is_followed = follow is not None
                
                # Check user rating
                user_score = await db.scalar(
                    select(PersonRating.score).where(
                        PersonRating.user_id == user_id,
                        PersonRating.person_id == person_id,
                    )
                )
                result.user_rating = user_score
            except Exception:
                await db.rollback()
                result.is_followed = False
                result.user_rating = None
        else:
            result.is_followed = None
            result.user_rating = None
            
        logger.info("person detail cache hit", person_id=person_id, user_id=user_id, ip=ip)
        return result

    # Cache miss
    try:
        person = await service.get_person(person_id, user_id=user_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch person", person_id=person_id, ip=ip)
        raise

    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    result = PersonDetail.model_validate(person)

    # Cache the public/unauthenticated detail (without user-specific fields)
    public_result = PersonDetail.model_validate(person)
    public_result.is_followed = None
    public_result.user_rating = None
    
    try:
        await redis.set(cache_key, public_result.model_dump_json(), ex=_PERSON_DETAIL_TTL)
    except Exception:
        pass

    logger.info("person fetched", person_id=person_id, user_id=user_id, ip=ip)
    return result
