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


@people_router.get("/{person_id}/related")
async def get_related_artists(
    person_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return related artists for a person with a Spotify artist ID."""
    from otix.domain.people import Person

    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    if not person.spotify_artist_id:
        return {"artists": []}

    from otix.infrastructure.redis import get_redis
    from otix.providers.spotify.client import SpotifyProvider

    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        related = await provider.get_related_artists(person.spotify_artist_id)
    except Exception:
        return {"artists": []}

    # Get existing Person records for these artists
    spotify_ids = [a.get("id") for a in related[:20] if a.get("id")]
    existing: dict[str, dict] = {}
    if spotify_ids:
        from sqlalchemy import select as sa_select
        result = await db.execute(
            sa_select(Person).where(Person.spotify_artist_id.in_(spotify_ids))
        )
        for p in result.scalars().all():
            if p.spotify_artist_id:
                existing[p.spotify_artist_id] = {
                    "id": p.id,
                    "name": p.name,
                    "image_url": p.spotify_image_url or p.photo_url,
                }

    artists = []
    for ra in related[:12]:
        ra_id = ra.get("id")
        images = ra.get("images", [])
        if ra_id and ra_id in existing:
            artists.append(existing[ra_id])
        else:
            artists.append({
                "id": None,
                "spotify_artist_id": ra_id,
                "name": ra.get("name"),
                "image_url": images[0].get("url") if images else None,
            })

    return {"artists": artists}
