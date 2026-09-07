from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.company.detail.follow import router as follow_router
from otix.api.company.detail.rating import router as rating_router
from otix.domain.user import User
from otix.schemas.media import CompanyOut
from otix.services.company_service import CompanyService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(
    company_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> CompanyOut:
    """Get details for a single company by its ID.

    Returns company metadata including follower count and the
    authenticated user's follow/rating state if available.
    """
    service = CompanyService(db)
    user_id = current_user.id if current_user else None
    try:
        result = await service.get_company(company_id, user_id=user_id)
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to fetch company",
            company_id=company_id,
            user_id=user_id,
        )
        raise

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    logger.info(
        "company fetched",
        company_id=company_id,
        user_id=user_id,
        ip=request.client.host if request.client else None,
    )
    return CompanyOut(**result)


router.include_router(rating_router)
router.include_router(follow_router)
