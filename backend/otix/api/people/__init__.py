from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.people.detail import router as detail_router
from otix.api.people.follow import router as follow_router
from otix.api.people.rating import router as rating_router
from otix.api.people.related import router as related_router
from otix.schemas.people import PersonListResponse, PersonSummary
from otix.services.people_service import PeopleService

logger = structlog.get_logger()

people_router = APIRouter(prefix="/person", tags=["person"])


@people_router.get("", response_model=PersonListResponse)
async def list_people(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor (person id)"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PersonListResponse:
    """List people with cursor-based pagination."""
    ip = request.client.host if request.client else None
    service = PeopleService(db)

    try:
        items, has_more = await service.list_people(cursor=cursor, limit=limit)
    except Exception:
        await db.rollback()
        logger.exception("failed to list people", ip=ip)
        raise

    next_cursor = items[-1].id if has_more and items else None

    logger.info("people listed", count=len(items), has_more=has_more, ip=ip)
    return PersonListResponse(
        items=[PersonSummary.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


people_router.include_router(detail_router)
people_router.include_router(follow_router)
people_router.include_router(rating_router)
people_router.include_router(related_router)
