from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.schemas.people import (
    PersonDetail,
    PersonListResponse,
    PersonSummary,
)
from otix.services.people_service import PeopleService

people_router = APIRouter(prefix="/person", tags=["person"])


@people_router.get("", response_model=PersonListResponse)
async def list_people(
    cursor: str | None = Query(None, description="Pagination cursor (person id)"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PersonListResponse:
    service = PeopleService(db)
    items, has_more = await service.list_people(cursor=cursor, limit=limit)

    next_cursor = items[-1].id if has_more and items else None

    return PersonListResponse(
        items=[PersonSummary.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@people_router.get("/search", response_model=PersonListResponse)
async def search_people(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PersonListResponse:
    service = PeopleService(db)
    items = await service.search_people(query_str=q, limit=limit)

    return PersonListResponse(
        items=[PersonSummary.model_validate(item) for item in items],
        has_more=False,
    )


@people_router.get("/{person_id}", response_model=PersonDetail)
async def get_person(
    person_id: str,
    db: AsyncSession = Depends(get_db),
) -> PersonDetail:
    service = PeopleService(db)
    person = await service.get_person(person_id)
    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    return PersonDetail.model_validate(person)
