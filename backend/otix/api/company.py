from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db, get_optional_user
from otix.api.schemas.media import CompanyOut
from otix.domain.user import User
from otix.services.company_service import CompanyService

company_router = APIRouter(prefix="/company", tags=["company"])


class RatingBody(BaseModel):
    score: int = Field(..., ge=1, le=5)


@company_router.get("/{company_id}", response_model=CompanyOut)
async def get_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> CompanyOut:
    service = CompanyService(db)
    user_id = current_user.id if current_user else None
    result = await service.get_company(company_id, user_id=user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyOut(**result)


@company_router.post("/{company_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = CompanyService(db)
    result = await service.get_company(company_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    await service.follow(current_user.id, result["id"])
    await db.commit()


@company_router.delete("/{company_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = CompanyService(db)
    result = await service.get_company(company_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    await service.unfollow(current_user.id, result["id"])
    await db.commit()


@company_router.put("/{company_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def rate_company(
    company_id: str,
    body: RatingBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = CompanyService(db)
    result = await service.get_company(company_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    await service.rate(current_user.id, result["id"], body.score)
    await db.commit()


@company_router.delete("/{company_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def unrate_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = CompanyService(db)
    result = await service.get_company(company_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Company not found")
    await service.unrate(current_user.id, result["id"])
    await db.commit()
