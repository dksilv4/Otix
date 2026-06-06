from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.services.company_service import CompanyService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/{company_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Follow a company.

    Adds the company to the authenticated user's followed list.
    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_company_follow(ip)

    service = CompanyService(db)
    try:
        result = await service.get_company(company_id)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
        await service.follow(current_user.id, result["id"])
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to follow company",
            company_id=company_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info(
        "company followed",
        company_id=company_id,
        user_id=current_user.id,
        ip=ip,
    )


@router.delete("/{company_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Unfollow a company.

    Removes the company from the authenticated user's followed list.
    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_company_follow(ip)

    service = CompanyService(db)
    try:
        result = await service.get_company(company_id)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
        await service.unfollow(current_user.id, result["id"])
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to unfollow company",
            company_id=company_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info(
        "company unfollowed",
        company_id=company_id,
        user_id=current_user.id,
        ip=ip,
    )
