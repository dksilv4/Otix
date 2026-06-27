from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_db
from otix.domain.media import ExternalID
from otix.domain.people import Person

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{person_id}/related")
async def get_related_artists(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return related artists for a person with a Spotify artist ID."""
    ip = request.client.host if request.client else None

    try:
        person = await db.scalar(
            sa_select(Person)
            .options(joinedload(Person._external_ids))
            .where(Person.id == person_id)
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch person for related artists", person_id=person_id, ip=ip)
        raise

    if not person:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Person not found"
        )
    if not person.spotify_artist_id:
        return {"artists": []}

    from otix.infrastructure.redis import get_redis
    from otix.providers.spotify.client import SpotifyProvider

    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        related = await provider.get_related_artists(person.spotify_artist_id)
    except Exception:
        logger.warning("failed to fetch related artists from spotify", person_id=person_id, ip=ip)
        return {"artists": []}

    spotify_ids = [a.get("id") for a in related[:20] if a.get("id")]
    existing: dict[str, dict] = {}
    if spotify_ids:
        try:
            result = await db.execute(
                sa_select(Person)
                .options(joinedload(Person._external_ids))
                .join(ExternalID, and_(
                    ExternalID.entity_id == Person.id,
                    ExternalID.entity_type == "person",
                    ExternalID.provider == "spotify",
                ))
                .where(ExternalID.external_id.in_(spotify_ids))
            )
            for p in result.unique().scalars().all():
                if p.spotify_artist_id:
                    existing[p.spotify_artist_id] = {
                        "id": p.id,
                        "name": p.name,
                        "image_url": p.spotify_image_url or p.photo_url,
                    }
        except Exception:
            await db.rollback()
            logger.warning("failed to look up existing persons for related artists", ip=ip)

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

    logger.info("related artists fetched", person_id=person_id, count=len(artists), ip=ip)
    return {"artists": artists}
