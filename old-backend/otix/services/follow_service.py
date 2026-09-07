# TODO: Review this file
from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.domain.follow import Follow, FollowRequest, FollowRequestStatus
from otix.domain.notification import Notification
from otix.domain.user import User


class FollowService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def follow(self, follower_id: str, followed_id: str) -> Follow | FollowRequest:
        if follower_id == followed_id:
            raise ValueError("Cannot follow yourself")

        existing_follow = await self.session.scalar(
            select(Follow).where(
                Follow.follower_id == follower_id,
                Follow.followed_id == followed_id,
            )
        )
        if existing_follow:
            raise ValueError("Already following this user")

        # Check for an existing pending request
        existing_request = await self.session.scalar(
            select(FollowRequest).where(
                FollowRequest.requester_id == follower_id,
                FollowRequest.target_id == followed_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
        )
        if existing_request:
            raise ValueError("Follow request already pending")

        target = await self.session.scalar(select(User).where(User.id == followed_id))
        if target is None:
            raise ValueError("User not found")

        if target.is_private:
            return await self.send_follow_request(follower_id, followed_id)

        follow = Follow(follower_id=follower_id, followed_id=followed_id)
        self.session.add(follow)

        from otix.infrastructure.celery import app
        app.send_task("xp.award", args=[followed_id, 1])

        follower = await self.session.scalar(select(User).where(User.id == follower_id))
        notification = Notification(
            user_id=followed_id,
            type="follow",
            title="New Follower",
            body=f"{follower.username if follower else 'Someone'} started following you",
            metadata_json={"follower_id": follower_id, "follower_username": follower.username if follower else None},
        )
        self.session.add(notification)

        await self.session.flush()
        return follow

    async def unfollow(self, follower_id: str, followed_id: str) -> bool:
        result = await self.session.execute(
            delete(Follow).where(
                Follow.follower_id == follower_id,
                Follow.followed_id == followed_id,
            )
        )
        await self.session.flush()
        return result.rowcount > 0

    # ── Follow requests ──────────────────────────────────

    async def send_follow_request(self, requester_id: str, target_id: str) -> FollowRequest:
        if requester_id == target_id:
            raise ValueError("Cannot request to follow yourself")

        existing = await self.session.scalar(
            select(FollowRequest).where(
                FollowRequest.requester_id == requester_id,
                FollowRequest.target_id == target_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
        )
        if existing:
            raise ValueError("Follow request already pending")

        req = FollowRequest(
            requester_id=requester_id,
            target_id=target_id,
            status=FollowRequestStatus.PENDING,
        )
        self.session.add(req)

        requester = await self.session.scalar(select(User).where(User.id == requester_id))
        notification = Notification(
            user_id=target_id,
            type="follow_request",
            title="New Follow Request",
            body=f"{requester.username if requester else 'Someone'} wants to follow you",
            metadata_json={"requester_id": requester_id, "request_id": req.id, "requester_username": requester.username if requester else None},
        )
        self.session.add(notification)

        await self.session.flush()
        return req

    async def accept_follow_request(self, request_id: str, target_id: str) -> FollowRequest:
        req = await self.session.scalar(
            select(FollowRequest).where(
                FollowRequest.id == request_id,
                FollowRequest.target_id == target_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
        )
        if req is None:
            raise ValueError("Follow request not found or already resolved")

        req.status = FollowRequestStatus.ACCEPTED

        # Create the follow relationship
        follow = Follow(follower_id=req.requester_id, followed_id=req.target_id)
        self.session.add(follow)

        from otix.infrastructure.celery import app
        app.send_task("xp.award", args=[req.target_id, 1])

        target = await self.session.scalar(select(User).where(User.id == req.target_id))
        notification = Notification(
            user_id=req.requester_id,
            type="follow_request_accepted",
            title="Follow Request Accepted",
            body=f"{target.username if target else 'Someone'} accepted your follow request",
            metadata_json={"target_id": req.target_id, "target_username": target.username if target else None},
        )
        self.session.add(notification)

        await self.session.flush()
        return req

    async def decline_follow_request(self, request_id: str, target_id: str) -> FollowRequest:
        req = await self.session.scalar(
            select(FollowRequest).where(
                FollowRequest.id == request_id,
                FollowRequest.target_id == target_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
        )
        if req is None:
            raise ValueError("Follow request not found or already resolved")

        req.status = FollowRequestStatus.DECLINED
        await self.session.flush()
        return req

    async def get_pending_requests(
        self, user_id: str, offset: int = 0, limit: int = 20
    ) -> tuple[list[FollowRequest], int]:
        count = await self.session.scalar(
            select(func.count()).select_from(FollowRequest).where(
                FollowRequest.target_id == user_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
        ) or 0

        stmt = (
            select(FollowRequest)
            .where(
                FollowRequest.target_id == user_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
            .options(selectinload(FollowRequest.requester))
            .order_by(FollowRequest.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.scalars(stmt)
        return list(result), count

    async def get_pending_request_count(self, user_id: str) -> int:
        count = await self.session.scalar(
            select(func.count()).select_from(FollowRequest).where(
                FollowRequest.target_id == user_id,
                FollowRequest.status == FollowRequestStatus.PENDING,
            )
        )
        return count or 0

    async def get_request_status(self, requester_id: str, target_id: str) -> str | None:
        req = await self.session.scalar(
            select(FollowRequest).where(
                FollowRequest.requester_id == requester_id,
                FollowRequest.target_id == target_id,
            ).order_by(FollowRequest.created_at.desc()).limit(1)
        )
        return req.status if req else None

    # ── Queries ──────────────────────────────────────────

    async def get_followers(self, user_id: str, cursor: str | None = None, limit: int = 20) -> tuple[list[User], str | None]:
        stmt = (
            select(User, Follow.created_at)
            .join(Follow, Follow.follower_id == User.id)
            .where(Follow.followed_id == user_id)
            .order_by(Follow.created_at.desc())
            .limit(limit + 1)
        )
        if cursor:
            stmt = stmt.where(Follow.created_at < cursor)

        result = await self.session.execute(stmt)
        rows = list(result)

        next_cursor = None
        if len(rows) > limit:
            _, last_created_at = rows[limit - 1]
            next_cursor = last_created_at.isoformat()

        users = [row[0] for row in rows[:limit]]
        return users, next_cursor

    async def get_following(self, user_id: str, cursor: str | None = None, limit: int = 20) -> tuple[list[User], str | None]:
        stmt = (
            select(User, Follow.created_at)
            .join(Follow, Follow.followed_id == User.id)
            .where(Follow.follower_id == user_id)
            .order_by(Follow.created_at.desc())
            .limit(limit + 1)
        )
        if cursor:
            stmt = stmt.where(Follow.created_at < cursor)

        result = await self.session.execute(stmt)
        rows = list(result)

        next_cursor = None
        if len(rows) > limit:
            _, last_created_at = rows[limit - 1]
            next_cursor = last_created_at.isoformat()

        users = [row[0] for row in rows[:limit]]
        return users, next_cursor

    async def get_counts(self, user_id: str) -> dict:
        followers = await self.session.scalar(
            select(func.count()).select_from(Follow).where(Follow.followed_id == user_id)
        ) or 0
        following = await self.session.scalar(
            select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
        ) or 0
        return {"followers": followers, "following": following}

    async def is_following(self, follower_id: str, followed_id: str) -> bool:
        result = await self.session.scalar(
            select(Follow).where(
                Follow.follower_id == follower_id,
                Follow.followed_id == followed_id,
            )
        )
        return result is not None
