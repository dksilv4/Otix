from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.follow import (
    FollowCountsOut,
    FollowRequestListOut,
    FollowRequestOut,
    FollowRequestResponse,
    FollowStatusOut,
    FollowUserOut,
)
from otix.domain.user import User
from otix.services.follow_service import FollowService

follow_router = APIRouter(prefix="/users/{username}", tags=["follow"])


def _resolve_username(router: APIRouter) -> APIRouter:
    """Workaround: include sub-routes under a unified prefix."""
    return router


async def _get_target_user(username: str, db: AsyncSession) -> User:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return target


# ── Follow / Unfollow ────────────────────────────────────

@follow_router.post("/follow", status_code=status.HTTP_201_CREATED)
async def follow_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    target = await _get_target_user(username, db)
    service = FollowService(db)
    try:
        result = await service.follow(current_user.id, target.id)
        await db.commit()

        from otix.domain.follow import FollowRequest
        if isinstance(result, FollowRequest):
            return {
                "message": f"Follow request sent to {username}",
                "status": "pending",
            }
        return {"message": f"Now following {username}", "status": "following"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@follow_router.delete("/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    target = await _get_target_user(username, db)
    service = FollowService(db)
    await service.unfollow(current_user.id, target.id)
    await db.commit()


# ── Follow requests ──────────────────────────────────────

@follow_router.get("/follow/requests", response_model=FollowRequestListOut)
async def get_pending_follow_requests(
    username: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowRequestListOut:
    target = await _get_target_user(username, db)
    if target.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own follow requests",
        )

    service = FollowService(db)
    requests, total = await service.get_pending_requests(
        current_user.id, offset=offset, limit=limit
    )
    return FollowRequestListOut(
        requests=[FollowRequestOut.model_validate(req) for req in requests],
        total=total,
    )


@follow_router.post("/follow/requests/{request_id}/accept", response_model=FollowRequestResponse)
async def accept_follow_request(
    username: str,
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowRequestResponse:
    target = await _get_target_user(username, db)
    if target.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only accept your own follow requests",
        )

    service = FollowService(db)
    try:
        await service.accept_follow_request(request_id, current_user.id)
        await db.commit()
        return FollowRequestResponse(message="Follow request accepted", request_id=request_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@follow_router.post("/follow/requests/{request_id}/decline", response_model=FollowRequestResponse)
async def decline_follow_request(
    username: str,
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowRequestResponse:
    target = await _get_target_user(username, db)
    if target.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only decline your own follow requests",
        )

    service = FollowService(db)
    try:
        await service.decline_follow_request(request_id, current_user.id)
        await db.commit()
        return FollowRequestResponse(message="Follow request declined", request_id=request_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── Followers / Following ────────────────────────────────

@follow_router.get("/followers", response_model=list[FollowUserOut])
async def get_followers(
    username: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[FollowUserOut]:
    target = await _get_target_user(username, db)
    service = FollowService(db)
    users, _ = await service.get_followers(target.id, limit=limit)
    return [FollowUserOut.model_validate(u) for u in users]


@follow_router.get("/following", response_model=list[FollowUserOut])
async def get_following(
    username: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[FollowUserOut]:
    target = await _get_target_user(username, db)
    service = FollowService(db)
    users, _ = await service.get_following(target.id, limit=limit)
    return [FollowUserOut.model_validate(u) for u in users]


@follow_router.get("/follow/counts", response_model=FollowCountsOut)
async def get_follow_counts(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> FollowCountsOut:
    target = await _get_target_user(username, db)
    service = FollowService(db)
    counts = await service.get_counts(target.id)
    return FollowCountsOut(**counts)


@follow_router.get("/follow/status", response_model=FollowStatusOut)
async def get_follow_status(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowStatusOut:
    target = await _get_target_user(username, db)
    service = FollowService(db)
    is_following = await service.is_following(current_user.id, target.id)
    has_pending = False
    if not is_following:
        status_val = await service.get_request_status(current_user.id, target.id)
        has_pending = status_val == "pending"
    is_private = target.is_private
    return FollowStatusOut(
        is_following=is_following,
        has_pending_request=has_pending,
        is_private=is_private,
    )
