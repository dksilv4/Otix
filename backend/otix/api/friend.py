from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.friend import FriendOut, FriendRequestOut, FriendshipStatusOut
from otix.domain.user import User
from otix.services.friend_service import FriendService

friend_router = APIRouter(prefix="/friends", tags=["friends"])


@friend_router.post("/requests/{user_id}", status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = FriendService(db)
    try:
        await service.send_request(current_user.id, user_id)
        await db.commit()
        return {"message": "Friend request sent"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@friend_router.post("/requests/{request_id}/accept")
async def accept_friend_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = FriendService(db)
    try:
        await service.accept_request(request_id, current_user.id)
        await db.commit()
        return {"message": "Friend request accepted"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@friend_router.post("/requests/{request_id}/reject")
async def reject_friend_request(
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = FriendService(db)
    try:
        await service.reject_request(request_id, current_user.id)
        await db.commit()
        return {"message": "Friend request rejected"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@friend_router.get("", response_model=list[FriendOut])
async def list_friends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
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
    return result


@friend_router.get("/requests/incoming", response_model=list[FriendRequestOut])
async def list_incoming_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FriendRequestOut]:
    service = FriendService(db)
    requests = await service.get_pending_received(current_user.id)
    return [FriendRequestOut.model_validate(r) for r in requests]


@friend_router.get("/requests/outgoing", response_model=list[FriendRequestOut])
async def list_outgoing_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FriendRequestOut]:
    service = FriendService(db)
    requests = await service.get_pending_sent(current_user.id)
    return [FriendRequestOut.model_validate(r) for r in requests]


@friend_router.delete("/{user_id}")
async def remove_friend(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = FriendService(db)
    removed = await service.remove_friend(current_user.id, user_id)
    await db.commit()
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend not found")
    return {"message": "Friend removed"}


@friend_router.get("/status/{user_id}", response_model=FriendshipStatusOut)
async def get_friendship_status(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FriendshipStatusOut:
    service = FriendService(db)
    status_data = await service.get_friendship_status(current_user.id, user_id)
    return FriendshipStatusOut(**status_data)
