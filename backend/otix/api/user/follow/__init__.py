from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.follow import FollowRequest
from otix.domain.user import User
from otix.schemas.follow import (
    FollowCountsOut,
    FollowRequestListOut,
    FollowRequestOut,
    FollowRequestResponse,
    FollowStatusOut,
    FollowUserOut,
)
from otix.services.follow_service import FollowService

logger = structlog.get_logger()

router = APIRouter(prefix="/users/{username}", tags=["follow"])


async def _get_target_user(username: str, db: AsyncSession) -> User:
    target = await db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return target


@router.post("/follow", status_code=status.HTTP_201_CREATED)
async def follow_user(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> dict:
    """Follow a user. Rate-limited per IP."""
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    target = await _get_target_user(username, db)
    service = FollowService(db)
    try:
        result = await service.follow(current_user.id, target.id)
        await db.commit()
        if isinstance(result, FollowRequest):
            return {"message": f"Follow request sent to {username}", "status": "pending"}
        return {"message": f"Now following {username}", "status": "following"}
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_user(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Unfollow a user. Rate-limited per IP."""
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    target = await _get_target_user(username, db)
    service = FollowService(db)
    try:
        await service.unfollow(current_user.id, target.id)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("failed to unfollow user", target_username=username, user_id=current_user.id, ip=ip)
        raise


@router.get("/follow/requests", response_model=FollowRequestListOut)
async def get_pending_follow_requests(
    username: str,
    request: Request,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowRequestListOut:
    """Get pending follow requests for the authenticated user."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    if target.id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own follow requests")

    service = FollowService(db)
    requests, total = await service.get_pending_requests(current_user.id, offset=offset, limit=limit)
    logger.info("pending follow requests fetched", username=username, count=len(requests), ip=ip)
    return FollowRequestListOut(
        requests=[FollowRequestOut.model_validate(req) for req in requests],
        total=total,
    )


@router.post("/follow/requests/{request_id}/accept", response_model=FollowRequestResponse)
async def accept_follow_request(
    username: str,
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowRequestResponse:
    """Accept a follow request."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    if target.id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only accept your own follow requests")

    service = FollowService(db)
    try:
        await service.accept_follow_request(request_id, current_user.id)
        await db.commit()
        logger.info("follow request accepted", request_id=request_id, username=username, ip=ip)
        return FollowRequestResponse(message="Follow request accepted", request_id=request_id)
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/follow/requests/{request_id}/decline", response_model=FollowRequestResponse)
async def decline_follow_request(
    username: str,
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowRequestResponse:
    """Decline a follow request."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    if target.id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only decline your own follow requests")

    service = FollowService(db)
    try:
        await service.decline_follow_request(request_id, current_user.id)
        await db.commit()
        logger.info("follow request declined", request_id=request_id, username=username, ip=ip)
        return FollowRequestResponse(message="Follow request declined", request_id=request_id)
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/followers", response_model=list[FollowUserOut])
async def get_followers(
    username: str,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[FollowUserOut]:
    """Get a user's followers."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    service = FollowService(db)
    users, _ = await service.get_followers(target.id, limit=limit)
    logger.info("followers fetched", username=username, count=len(users), ip=ip)
    return [FollowUserOut.model_validate(u) for u in users]


@router.get("/following", response_model=list[FollowUserOut])
async def get_following(
    username: str,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[FollowUserOut]:
    """Get who a user is following."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    service = FollowService(db)
    users, _ = await service.get_following(target.id, limit=limit)
    logger.info("following fetched", username=username, count=len(users), ip=ip)
    return [FollowUserOut.model_validate(u) for u in users]


@router.get("/follow/counts", response_model=FollowCountsOut)
async def get_follow_counts(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FollowCountsOut:
    """Get a user's follower and following counts."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    service = FollowService(db)
    counts = await service.get_counts(target.id)
    logger.info("follow counts fetched", username=username, ip=ip)
    return FollowCountsOut(**counts)


@router.get("/follow/status", response_model=FollowStatusOut)
async def get_follow_status(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FollowStatusOut:
    """Get follow relationship status between current user and target."""
    ip = request.client.host if request.client else None
    target = await _get_target_user(username, db)
    service = FollowService(db)
    is_following = await service.is_following(current_user.id, target.id)
    has_pending = False
    if not is_following:
        status_val = await service.get_request_status(current_user.id, target.id)
        has_pending = status_val == "pending"
    logger.info("follow status fetched", username=username, is_following=is_following, ip=ip)
    return FollowStatusOut(
        is_following=is_following,
        has_pending_request=has_pending,
        is_private=target.is_private,
    )
