from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.domain.user import User
from otix.schemas.people import PersonDetail, PersonListResponse, PersonSummary
from otix.services.people_service import PeopleService

logger = structlog.get_logger()

router = APIRouter()


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

    try:
        person = await service.get_person(person_id, user_id=user_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch person", person_id=person_id, ip=ip)
        raise

    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Person not found"
        )

    logger.info("person fetched", person_id=person_id, user_id=user_id, ip=ip)
    return PersonDetail.model_validate(person)
