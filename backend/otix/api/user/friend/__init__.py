from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.friend import FriendOut, FriendRequestOut, FriendshipStatusOut
from otix.services.friend_service import FriendService

logger = structlog.get_logger()

router = APIRouter(prefix="/friends", tags=["friends"])


@router.post("/requests/{user_id}", status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Send a friend request to another user."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    try:
        await service.send_request(current_user.id, user_id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        await db.rollback()
        logger.exception("failed to send friend request", user_id=user_id, ip=ip)
        raise

    logger.info("friend request sent", target_user_id=user_id, current_user_id=current_user.id, ip=ip)
    return {"message": "Friend request sent"}


@router.post("/requests/{request_id}/accept")
async def accept_friend_request(
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Accept a friend request."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    try:
        await service.accept_request(request_id, current_user.id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception:
        await db.rollback()
        logger.exception("failed to accept friend request", request_id=request_id, ip=ip)
        raise

    logger.info("friend request accepted", request_id=request_id, ip=ip)
    return {"message": "Friend request accepted"}


@router.post("/requests/{request_id}/reject")
async def reject_friend_request(
    request_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Reject a friend request."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    try:
        await service.reject_request(request_id, current_user.id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception:
        await db.rollback()
        logger.exception("failed to reject friend request", request_id=request_id, ip=ip)
        raise

    logger.info("friend request rejected", request_id=request_id, ip=ip)
    return {"message": "Friend request rejected"}


@router.get("", response_model=list[FriendOut])
async def list_friends(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FriendOut]:
    """List the authenticated user's friends."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    friends = await service.get_friends(current_user.id)
    result = []
    for friend in friends:
        friends_since = await service.get_friends_since(current_user.id, friend.id)
        result.append(
            FriendOut(
                id=friend.id,
                username=friend.username,
                avatar_url=friend.avatar_url,
                friends_since=friends_since,
            )
        )
    logger.info("friends listed", count=len(result), ip=ip)
    return result


@router.get("/requests/incoming", response_model=list[FriendRequestOut])
async def list_incoming_requests(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FriendRequestOut]:
    """List incoming friend requests."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    requests = await service.get_pending_received(current_user.id)
    logger.info("incoming friend requests listed", count=len(requests), ip=ip)
    return [FriendRequestOut.model_validate(r) for r in requests]


@router.get("/requests/outgoing", response_model=list[FriendRequestOut])
async def list_outgoing_requests(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FriendRequestOut]:
    """List outgoing friend requests."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    requests = await service.get_pending_sent(current_user.id)
    logger.info("outgoing friend requests listed", count=len(requests), ip=ip)
    return [FriendRequestOut.model_validate(r) for r in requests]


@router.delete("/{user_id}")
async def remove_friend(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Remove a friend."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    removed = await service.remove_friend(current_user.id, user_id)
    await db.commit()
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend not found")
    logger.info("friend removed", target_user_id=user_id, ip=ip)
    return {"message": "Friend removed"}


@router.get("/status/{user_id}", response_model=FriendshipStatusOut)
async def get_friendship_status(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FriendshipStatusOut:
    """Get friendship status with another user."""
    ip = request.client.host if request.client else None
    service = FriendService(db)
    status_data = await service.get_friendship_status(current_user.id, user_id)
    logger.info("friendship status fetched", target_user_id=user_id, ip=ip)
    return FriendshipStatusOut(**status_data)
