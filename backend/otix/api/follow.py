from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.follow import FollowCountsOut, FollowStatusOut, FollowUserOut
from otix.domain.user import User
from otix.services.follow_service import FollowService

follow_router = APIRouter(prefix="/users/{username}", tags=["follow"])


def _resolve_username(router: APIRouter) -> APIRouter:
    """Workaround: include sub-routes under a unified prefix."""
    return router


@follow_router.post("/follow", status_code=status.HTTP_201_CREATED)
async def follow_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = FollowService(db)
    try:
        await service.follow(current_user.id, target.id)
        await db.commit()
        return {"message": f"Now following {username}"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@follow_router.delete("/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = FollowService(db)
    await service.unfollow(current_user.id, target.id)
    await db.commit()


@follow_router.get("/followers", response_model=list[FollowUserOut])
async def get_followers(
    username: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[FollowUserOut]:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = FollowService(db)
    users, _ = await service.get_followers(target.id, limit=limit)
    return [FollowUserOut.model_validate(u) for u in users]


@follow_router.get("/following", response_model=list[FollowUserOut])
async def get_following(
    username: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[FollowUserOut]:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = FollowService(db)
    users, _ = await service.get_following(target.id, limit=limit)
    return [FollowUserOut.model_validate(u) for u in users]


@follow_router.get("/follow/counts", response_model=FollowCountsOut)
async def get_follow_counts(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> FollowCountsOut:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = FollowService(db)
    counts = await service.get_counts(target.id)
    return FollowCountsOut(**counts)


@follow_router.get("/follow/status", response_model=FollowStatusOut)
async def get_follow_status(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowStatusOut:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = FollowService(db)
    is_following = await service.is_following(current_user.id, target.id)
    return FollowStatusOut(is_following=is_following)
