from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.friend import FriendRequest
from otix.domain.notification import Notification
from otix.domain.user import User
from otix.infrastructure.celery import app


class FriendService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def send_request(self, sender_id: str, receiver_id: str) -> FriendRequest:
        if sender_id == receiver_id:
            raise ValueError("Cannot send friend request to yourself")

        existing = await self.session.scalar(
            select(FriendRequest).where(
                (
                    (FriendRequest.sender_id == sender_id)
                    & (FriendRequest.receiver_id == receiver_id)
                )
                | (
                    (FriendRequest.sender_id == receiver_id)
                    & (FriendRequest.receiver_id == sender_id)
                )
            )
        )
        if existing:
            if existing.status == "accepted":
                raise ValueError("Already friends")
            if existing.status == "pending":
                raise ValueError("A pending request already exists")

        request = FriendRequest(sender_id=sender_id, receiver_id=receiver_id, status="pending")
        self.session.add(request)

        sender = await self.session.scalar(select(User).where(User.id == sender_id))
        notification = Notification(
            user_id=receiver_id,
            type="friend_request",
            title="New Friend Request",
            body=f"{sender.username if sender else 'Someone'} sent you a friend request",
            metadata_json={"sender_id": sender_id, "request_id": request.id},
        )
        self.session.add(notification)

        await self.session.flush()
        return request

    async def accept_request(self, request_id: str, user_id: str) -> FriendRequest:
        request = await self.session.scalar(
            select(FriendRequest)
            .options(joinedload(FriendRequest.sender))
            .where(FriendRequest.id == request_id)
        )
        if not request:
            raise ValueError("Friend request not found")
        if request.receiver_id != user_id:
            raise PermissionError("You can only accept requests sent to you")
        if request.status != "pending":
            raise ValueError("Request is no longer pending")

        request.status = "accepted"

        notification = Notification(
            user_id=request.sender_id,
            type="friend_accepted",
            title="Friend Request Accepted",
            body=f"{request.receiver.username if hasattr(request, 'receiver') else 'Someone'} accepted your friend request",
            metadata_json={"sender_id": request.sender_id, "receiver_id": request.receiver_id},
        )
        self.session.add(notification)

        await self.session.flush()

        app.send_task("gamification.check_badges", args=[request.sender_id])
        app.send_task("gamification.check_badges", args=[request.receiver_id])

        return request

    async def reject_request(self, request_id: str, user_id: str) -> FriendRequest:
        request = await self.session.scalar(
            select(FriendRequest)
            .options(joinedload(FriendRequest.sender))
            .where(FriendRequest.id == request_id)
        )
        if not request:
            raise ValueError("Friend request not found")
        if request.receiver_id != user_id:
            raise PermissionError("You can only reject requests sent to you")
        if request.status != "pending":
            raise ValueError("Request is no longer pending")

        request.status = "rejected"

        sender_name = request.sender.username if request.sender else "Someone"
        notification = Notification(
            user_id=request.sender_id,
            type="friend_rejected",
            title="Friend Request Declined",
            body=f"{sender_name} declined your friend request",
            metadata_json={"receiver_id": user_id, "request_id": request.id},
        )
        self.session.add(notification)

        await self.session.flush()
        return request

    async def get_friends(self, user_id: str) -> list[User]:
        result = await self.session.scalars(
            select(User)
            .join(
                FriendRequest,
                or_(
                    (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == User.id),
                    (FriendRequest.receiver_id == user_id) & (FriendRequest.sender_id == User.id),
                ),
            )
            .where(FriendRequest.status == "accepted")
            .order_by(User.username)
        )
        return list(result)

    async def get_friendship_status(self, user_id_a: str, user_id_b: str) -> dict:
        request = await self.session.scalar(
            select(FriendRequest).where(
                (
                    (FriendRequest.sender_id == user_id_a)
                    & (FriendRequest.receiver_id == user_id_b)
                )
                | (
                    (FriendRequest.sender_id == user_id_b)
                    & (FriendRequest.receiver_id == user_id_a)
                )
            )
        )
        if not request:
            return {"status": "none", "request_id": None}
        if request.status == "accepted":
            return {"status": "friends", "request_id": request.id}
        if request.status == "pending":
            if request.sender_id == user_id_a:
                return {"status": "pending_sent", "request_id": request.id}
            return {"status": "pending_received", "request_id": request.id}
        return {"status": "none", "request_id": None}

    async def get_pending_received(self, user_id: str) -> list[FriendRequest]:
        result = await self.session.scalars(
            select(FriendRequest)
            .options(joinedload(FriendRequest.sender), joinedload(FriendRequest.receiver))
            .where(
                FriendRequest.receiver_id == user_id,
                FriendRequest.status == "pending",
            )
            .order_by(FriendRequest.created_at.desc())
        )
        return list(result)

    async def get_pending_sent(self, user_id: str) -> list[FriendRequest]:
        result = await self.session.scalars(
            select(FriendRequest)
            .options(joinedload(FriendRequest.sender), joinedload(FriendRequest.receiver))
            .where(
                FriendRequest.sender_id == user_id,
                FriendRequest.status == "pending",
            )
            .order_by(FriendRequest.created_at.desc())
        )
        return list(result)

    async def get_friends_since(self, user_id: str, friend_id: str) -> datetime | None:
        request = await self.session.scalar(
            select(FriendRequest).where(
                (
                    (FriendRequest.sender_id == user_id)
                    & (FriendRequest.receiver_id == friend_id)
                )
                | (
                    (FriendRequest.sender_id == friend_id)
                    & (FriendRequest.receiver_id == user_id)
                ),
                FriendRequest.status == "accepted",
            )
        )
        return request.updated_at if request else None

    async def remove_friend(self, user_id: str, friend_id: str) -> bool:
        result = await self.session.execute(
            delete(FriendRequest).where(
                (
                    (FriendRequest.sender_id == user_id)
                    & (FriendRequest.receiver_id == friend_id)
                )
                | (
                    (FriendRequest.sender_id == friend_id)
                    & (FriendRequest.receiver_id == user_id)
                ),
                FriendRequest.status == "accepted",
            )
        )
        if result.rowcount > 0:
            remover = await self.session.scalar(select(User).where(User.id == user_id))
            name = remover.username if remover else "Someone"
            notification = Notification(
                user_id=friend_id,
                type="friend_removed",
                title="Friend Removed",
                body=f"{name} removed you as a friend",
                metadata_json={"remover_id": user_id},
            )
            self.session.add(notification)

        await self.session.flush()
        return result.rowcount > 0
