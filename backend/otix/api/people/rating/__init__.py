from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.people import Person
from otix.domain.user import User
from otix.schemas.people import PersonRatingBody
from otix.services.people_service import PeopleService

logger = structlog.get_logger()

router = APIRouter()


@router.put("/{person_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def rate_person(
    person_id: str,
    body: PersonRatingBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Rate a person on a 1–5 scale.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_person_rating(ip)

    try:
        person = await db.get(Person, person_id)
        if person is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Person not found"
            )
        service = PeopleService(db)
        await service.rate_person(current_user.id, person_id, body.score)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to rate person",
            person_id=person_id,
            user_id=current_user.id,
            score=body.score,
            ip=ip,
        )
        raise

    logger.info("person rated", person_id=person_id, user_id=current_user.id, ip=ip)


@router.delete("/{person_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def unrate_person(
    person_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Remove the authenticated user's rating for a person.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_person_rating(ip)

    try:
        person = await db.get(Person, person_id)
        if person is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Person not found"
            )
        service = PeopleService(db)
        await service.unrate_person(current_user.id, person_id)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to unrate person",
            person_id=person_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("person unrated", person_id=person_id, user_id=current_user.id, ip=ip)
