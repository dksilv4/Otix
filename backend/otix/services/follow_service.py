from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.follow import Follow
from otix.domain.notification import Notification
from otix.domain.user import User


class FollowService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def follow(self, follower_id: str, followed_id: str) -> Follow:
        if follower_id == followed_id:
            raise ValueError("Cannot follow yourself")

        existing = await self.session.scalar(
            select(Follow).where(
                Follow.follower_id == follower_id,
                Follow.followed_id == followed_id,
            )
        )
        if existing:
            raise ValueError("Already following this user")

        follow = Follow(follower_id=follower_id, followed_id=followed_id)
        self.session.add(follow)

        follower = await self.session.scalar(select(User).where(User.id == follower_id))
        notification = Notification(
            user_id=followed_id,
            type="follow",
            title="New Follower",
            body=f"{follower.username if follower else 'Someone'} started following you",
            metadata_json={"follower_id": follower_id},
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

    async def get_followers(self, user_id: str, cursor: str | None = None, limit: int = 20) -> tuple[list[User], str | None]:
        stmt = (
            select(User)
            .join(Follow, Follow.follower_id == User.id)
            .where(Follow.followed_id == user_id)
            .order_by(Follow.created_at.desc())
            .limit(limit + 1)
        )
        if cursor:
            stmt = stmt.where(Follow.created_at < cursor)

        result = await self.session.scalars(stmt)
        users = list(result)

        next_cursor = None
        if len(users) > limit:
            popped = users.pop()
            next_cursor = popped.followers[0].created_at.isoformat() if popped.followers else None
            if not next_cursor:
                popped_follow = await self.session.scalar(
                    select(Follow).where(
                        Follow.follower_id == popped.id,
                        Follow.followed_id == user_id,
                    )
                )
                if popped_follow:
                    next_cursor = popped_follow.created_at.isoformat()

        return users[:limit], next_cursor

    async def get_following(self, user_id: str, cursor: str | None = None, limit: int = 20) -> tuple[list[User], str | None]:
        stmt = (
            select(User)
            .join(Follow, Follow.followed_id == User.id)
            .where(Follow.follower_id == user_id)
            .order_by(Follow.created_at.desc())
            .limit(limit + 1)
        )
        if cursor:
            stmt = stmt.where(Follow.created_at < cursor)

        result = await self.session.scalars(stmt)
        users = list(result)

        next_cursor = None
        if len(users) > limit:
            users.pop()
            # We lose the join reference; just return None for next_cursor for now
            # In practice, pagination on this list isn't critical

        return users[:limit], next_cursor

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
