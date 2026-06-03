from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.media import MediaItem
from otix.domain.media_rating import MediaItemRating
from otix.domain.review import Review
from otix.infrastructure.celery import app
from otix.lib.xp import REVIEW_WITH_CONTENT

REVIEW_COOLDOWN_MINUTES = 15


class ReviewService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_review(
        self,
        user_id: str,
        media_item_id: str,
        title: str | None,
        content: str | None,
        is_spoiler: bool,
        is_private: bool = False,
    ) -> Review:
        existing = await self.session.scalar(
            select(Review).where(
                Review.user_id == user_id,
                Review.media_item_id == media_item_id,
            )
        )

        is_new = existing is None
        now = datetime.now(timezone.utc)
        cooldown_until = now + timedelta(minutes=REVIEW_COOLDOWN_MINUTES)

        if existing:
            in_cooldown = existing.cooldown_until is not None and existing.cooldown_until > now
            if in_cooldown:
                existing.title = title
                existing.content = content
                existing.is_spoiler = is_spoiler
                existing.is_private = is_private
                existing.cooldown_until = cooldown_until
        else:
            existing = Review(
                user_id=user_id,
                media_item_id=media_item_id,
                title=title,
                content=content,
                is_spoiler=is_spoiler,
                is_private=is_private,
                cooldown_until=cooldown_until,
            )
            self.session.add(existing)

        await self.session.flush()

        if is_new:
            app.send_task("xp.award", args=[user_id, REVIEW_WITH_CONTENT])

        app.send_task("streak.update", args=[user_id])
        app.send_task("streak.update_review", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])

        return existing

    async def get_my_review(self, user_id: str, media_item_id: str) -> Review | None:
        return await self.session.scalar(
            select(Review).where(
                Review.user_id == user_id,
                Review.media_item_id == media_item_id,
            )
        )

    async def get_reviews_for_media(
        self,
        media_item_id: str,
        cursor: str | None = None,
        limit: int = 20,
        current_user_id: str | None = None,
    ) -> tuple[list[Review], bool]:
        now = datetime.now(timezone.utc)
        query = (
            select(Review)
            .options(joinedload(Review.user))
            .where(
                Review.media_item_id == media_item_id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
            .order_by(Review.created_at.desc(), Review.user_id)
        )
        # Hide reviews still in cooldown from other users
        if current_user_id is not None:
            query = query.where(
                (Review.cooldown_until <= now) | (Review.user_id == current_user_id)
            )
        else:
            query = query.where(Review.cooldown_until <= now)

        if cursor:
            parts = cursor.split("__", 1)
            if len(parts) == 2:
                cursor_created_at, cursor_user_id = parts[0], parts[1]
                query = query.where(
                    (Review.created_at < cursor_created_at)
                    | (
                        (Review.created_at == cursor_created_at)
                        & (Review.user_id > cursor_user_id)
                    )
                )

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def get_reviews_by_user(
        self,
        user_id: str,
        cursor: str | None = None,
        limit: int = 20,
        current_user_id: str | None = None,
    ) -> tuple[list[Review], bool]:
        now = datetime.now(timezone.utc)
        query = (
            select(Review)
            .options(joinedload(Review.user))
            .where(
                Review.user_id == user_id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
            .order_by(Review.created_at.desc())
        )
        # Hide reviews still in cooldown from other users
        if current_user_id is not None and current_user_id == user_id:
            pass  # viewing own profile — show all
        else:
            query = query.where(Review.cooldown_until <= now)

        if cursor:
            query = query.where(Review.created_at < cursor)

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def delete_review(self, user_id: str, media_item_id: str) -> bool:
        result = await self.session.execute(
            delete(Review).where(
                Review.user_id == user_id,
                Review.media_item_id == media_item_id,
            )
        )
        if result.rowcount == 0:
            return False

        return True

    async def get_reviews_for_media_with_ratings(
        self,
        media_item_id: str,
        cursor: str | None = None,
        limit: int = 20,
        current_user_id: str | None = None,
    ) -> tuple[list[tuple[Review, MediaItemRating | None]], bool]:
        """Like get_reviews_for_media but also loads each reviewer's rating."""
        now = datetime.now(timezone.utc)
        query = (
            select(Review, MediaItemRating)
            .options(joinedload(Review.user))
            .outerjoin(
                MediaItemRating,
                (MediaItemRating.user_id == Review.user_id)
                & (MediaItemRating.media_item_id == Review.media_item_id),
            )
            .where(
                Review.media_item_id == media_item_id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
            .order_by(Review.created_at.desc(), Review.user_id)
        )
        if current_user_id is not None:
            query = query.where(
                (Review.cooldown_until <= now) | (Review.user_id == current_user_id)
            )
        else:
            query = query.where(Review.cooldown_until <= now)

        if cursor:
            parts = cursor.split("__", 1)
            if len(parts) == 2:
                cursor_created_at, cursor_user_id = parts[0], parts[1]
                query = query.where(
                    (Review.created_at < cursor_created_at)
                    | (
                        (Review.created_at == cursor_created_at)
                        & (Review.user_id > cursor_user_id)
                    )
                )

        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more
