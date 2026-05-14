from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.track import TrackRatingCreate, TrackRatingOut
from otix.domain.media import Track
from otix.domain.user import User
from otix.services.track_rating_service import TrackRatingService

track_router = APIRouter(prefix="/tracks", tags=["tracks"])


@track_router.get("/{track_id}/rating", response_model=TrackRatingOut | None)
async def get_my_track_rating(
    track_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrackRatingOut | None:
    track = await db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    service = TrackRatingService(db)
    rating = await service.get_my_rating(current_user.id, track_id)
    if rating is None:
        return None

    out = TrackRatingOut.model_validate(rating)
    out.avg_rating = track.avg_rating
    out.rating_count = track.rating_count
    return out


@track_router.put("/{track_id}/rating", response_model=TrackRatingOut)
async def upsert_track_rating(
    track_id: str,
    body: TrackRatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrackRatingOut:
    track = await db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    service = TrackRatingService(db)
    rating, avg, count = await service.upsert_rating(current_user.id, track_id, body.score)
    out = TrackRatingOut.model_validate(rating)
    out.avg_rating = avg
    out.rating_count = count
    return out
