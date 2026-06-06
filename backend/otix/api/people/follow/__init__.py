from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.people import PersonFollowResponse
from otix.domain.people import Person, UserPersonFollow
from otix.domain.user import User

logger = structlog.get_logger()

router = APIRouter()


@router.post("/{person_id}/follow", response_model=PersonFollowResponse)
async def follow_person(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> PersonFollowResponse:
    """Follow a person.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_person_follow(ip)

    try:
        person = await db.get(Person, person_id)
        if person is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Person not found"
            )

        existing = await db.get(UserPersonFollow, (current_user.id, person_id))
        if not existing:
            follow = UserPersonFollow(user_id=current_user.id, person_id=person_id)
            db.add(follow)

        count = await db.scalar(
            select(func.count()).where(UserPersonFollow.person_id == person_id)
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to follow person",
            person_id=person_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("person followed", person_id=person_id, user_id=current_user.id, ip=ip)
    return PersonFollowResponse(followed=True, follower_count=count or 0)


@router.delete("/{person_id}/follow", response_model=PersonFollowResponse)
async def unfollow_person(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> PersonFollowResponse:
    """Unfollow a person.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_person_follow(ip)

    try:
        person = await db.get(Person, person_id)
        if person is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Person not found"
            )

        follow = await db.get(UserPersonFollow, (current_user.id, person_id))
        if follow:
            await db.delete(follow)

        count = await db.scalar(
            select(func.count()).where(UserPersonFollow.person_id == person_id)
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to unfollow person",
            person_id=person_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("person unfollowed", person_id=person_id, user_id=current_user.id, ip=ip)
    return PersonFollowResponse(followed=False, follower_count=count or 0)
