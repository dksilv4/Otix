from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.media import CompanyRatingBody
from otix.domain.user import User
from otix.services.company_service import CompanyService

logger = structlog.get_logger()

router = APIRouter()


@router.put("/{company_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def rate_company(
    company_id: str,
    body: CompanyRatingBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Rate a company on a 1–5 scale.

    Sets or updates the authenticated user's rating for the company.
    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_company_rating(ip)

    service = CompanyService(db)
    try:
        result = await service.get_company(company_id)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
        await service.rate(current_user.id, result["id"], body.score)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to rate company",
            company_id=company_id,
            user_id=current_user.id,
            score=body.score,
            ip=ip,
        )
        raise

    logger.info(
        "company rated",
        company_id=company_id,
        user_id=current_user.id,
        score=body.score,
        ip=ip,
    )


@router.delete("/{company_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def unrate_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Remove the authenticated user's rating for a company.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_company_rating(ip)

    service = CompanyService(db)
    try:
        result = await service.get_company(company_id)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
        await service.unrate(current_user.id, result["id"])
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to unrate company",
            company_id=company_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info(
        "company unrated",
        company_id=company_id,
        user_id=current_user.id,
        ip=ip,
    )
