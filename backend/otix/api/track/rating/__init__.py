from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.track import TrackRatingCreate, TrackRatingOut
from otix.domain.media import Track
from otix.domain.user import User
from otix.services.track_rating_service import TrackRatingService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{track_id}/rating", response_model=TrackRatingOut | None)
async def get_my_track_rating(
    track_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrackRatingOut | None:
    """Get the authenticated user's rating for a track."""
    ip = client_ip(request)

    try:
        track = await db.get(Track, track_id)
        if track is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Track not found"
            )

        service = TrackRatingService(db)
        rating = await service.get_my_rating(current_user.id, track_id)
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to get track rating", track_id=track_id, user_id=current_user.id, ip=ip)
        raise

    if rating is None:
        return None

    out = TrackRatingOut.model_validate(rating)
    out.avg_rating = track.avg_rating
    out.rating_count = track.rating_count

    logger.info("track rating fetched", track_id=track_id, user_id=current_user.id, ip=ip)
    return out


@router.put("/{track_id}/rating", response_model=TrackRatingOut)
async def upsert_track_rating(
    track_id: str,
    body: TrackRatingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TrackRatingOut:
    """Rate a track or update an existing rating.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_person_rating(ip)

    try:
        track = await db.get(Track, track_id)
        if track is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Track not found"
            )

        service = TrackRatingService(db)
        rating, avg, count = await service.upsert_rating(current_user.id, track_id, body.score)
        await db.flush()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to upsert track rating",
            track_id=track_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    out = TrackRatingOut.model_validate(rating)
    out.avg_rating = avg
    out.rating_count = count

    logger.info("track rating upserted", track_id=track_id, user_id=current_user.id, ip=ip)
    return out
