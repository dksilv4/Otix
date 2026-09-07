from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.domain.user import User
from otix.schemas.karma import KarmaOut, KarmaTransactionOut
from otix.services.karma_service import KarmaService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{username}/karma", response_model=KarmaOut)
async def get_user_karma(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> KarmaOut:
    """Get a user's karma balance."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        service = KarmaService(db)
        balance = await service.get_karma_balance(user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user karma", username=username, ip=ip)
        raise

    logger.info("user karma fetched", username=username, ip=ip)
    return KarmaOut(balance=balance)


@router.get("/{username}/karma/transactions", response_model=list[KarmaTransactionOut])
async def get_user_karma_transactions(
    username: str,
    request: Request,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[KarmaTransactionOut]:
    """Get a user's karma transaction history."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        service = KarmaService(db)
        items, _ = await service.get_karma_transactions(user.id, cursor=cursor, limit=limit)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch karma transactions", username=username, ip=ip)
        raise

    logger.info("karma transactions fetched", username=username, count=len(items), ip=ip)
    return [KarmaTransactionOut(amount=item.amount, reason=item.reason, created_at=item.created_at) for item in items]
