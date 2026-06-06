# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import MediaItem
from otix.infrastructure.celery import app
from otix.lib.xp import INTERACTION_LIKE_WATCHLIST_STARTED, INTERACTION_WATCHED_PLAYED

_TYPE_TO_COLUMN: dict[str, str | None] = {
    "liked": "like_count",
    "watchlisted": "watchlist_count",
    "watched": "watched_count",
    "played": "played_count",
    "started": "started_count",
    "listened": "listened_count",
    "owned": None,  # ownership is private — no public count column
}

_VALID_TYPES = frozenset(_TYPE_TO_COLUMN)


class InteractionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_youtube_liked_interaction(
        self, user_id: str, media_item_id: str
    ) -> UserMediaInteraction | None:
        """Return a YouTube liked-video interaction for a user+media combination, if any."""
        return await self.session.scalar(
            select(UserMediaInteraction)
            .where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id == media_item_id,
                UserMediaInteraction.interaction_type == "listened",
                UserMediaInteraction.extra_data["source"].as_string() == "youtube_liked_videos",
            )
            .limit(1)
        )

    async def get_user_interactions(
        self, user_id: str, media_item_id: str
    ) -> dict[str, bool]:
        result = await self.session.scalars(
            select(UserMediaInteraction.interaction_type).where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id == media_item_id,
                UserMediaInteraction.interaction_type.in_(_VALID_TYPES),
            )
        )
        active = set(result.all())
        return {t: t in active for t in _VALID_TYPES}

    async def get_batch_interactions(
        self, user_id: str, media_item_ids: list[str]
    ) -> dict[str, dict[str, bool]]:
        interactions: dict[str, dict[str, bool]] = {
            mid: {t: False for t in _VALID_TYPES} for mid in media_item_ids
        }
        if not media_item_ids:
            return interactions

        result = await self.session.execute(
            select(
                UserMediaInteraction.media_item_id,
                UserMediaInteraction.interaction_type,
            ).where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id.in_(media_item_ids),
                UserMediaInteraction.interaction_type.in_(_VALID_TYPES),
            )
        )
        for row in result:
            if row.media_item_id in interactions:
                interactions[row.media_item_id][row.interaction_type] = True
        return interactions

    async def set_interaction(
        self,
        user_id: str,
        media_item_id: str,
        interaction_type: str,
        extra_data: dict | None = None,
    ) -> UserMediaInteraction:
        existing = await self.session.scalar(
            select(UserMediaInteraction).where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id == media_item_id,
                UserMediaInteraction.interaction_type == interaction_type,
            )
        )

        is_new = existing is None

        if existing:
            if extra_data:
                existing.extra_data = extra_data
        else:
            existing = UserMediaInteraction(
                user_id=user_id,
                media_item_id=media_item_id,
                interaction_type=interaction_type,
                extra_data=extra_data or {},
            )
            self.session.add(existing)

        await self.session.flush()
        await self._recalc_count(media_item_id, interaction_type)

        if is_new:
            amount = (
                INTERACTION_WATCHED_PLAYED
                if interaction_type in ("watched", "played", "listened")
                else INTERACTION_LIKE_WATCHLIST_STARTED
            )
            app.send_task("xp.award", args=[user_id, amount])

        app.send_task("streak.update", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])

        return existing

    async def set_interactions_batch(
        self,
        user_id: str,
        interactions: list[tuple[str, str, dict | None]],
    ) -> int:
        """Batch upsert interactions for a single user. Returns count of NEW interactions.

        Each tuple is (media_item_id, interaction_type, extra_data).
        Uses INSERT ... ON CONFLICT DO UPDATE to avoid SELECT-before-write.
        """
        if not interactions:
            return 0

        # Build rows for batch upsert
        now = datetime.utcnow()
        rows = [
            {
                "user_id": user_id,
                "media_item_id": mid,
                "interaction_type": itype,
                "metadata": extra or {},
                "created_at": now,
                "updated_at": now,
            }
            for mid, itype, extra in interactions
        ]

        await self.session.execute(
            pg_insert(UserMediaInteraction.__table__)
            .values(rows)
            .on_conflict_do_update(
                index_elements=["user_id", "media_item_id", "interaction_type"],
                set_={"metadata": pg_insert.excluded.metadata, "updated_at": now},
            )
        )

        # Recalculate counts for each unique (media_item_id, interaction_type) pair
        seen: set[tuple[str, str]] = set()
        for mid, itype, _ in interactions:
            key = (mid, itype)
            if key not in seen:
                seen.add(key)
                col_name = _TYPE_TO_COLUMN.get(itype)
                if col_name:
                    await self.session.execute(
                        update(MediaItem)
                        .where(MediaItem.id == mid)
                        .values(
                            **{
                                col_name: select(func.count())
                                .select_from(UserMediaInteraction)
                                .where(
                                    UserMediaInteraction.media_item_id == mid,
                                    UserMediaInteraction.interaction_type == itype,
                                )
                                .scalar_subquery()
                            }
                        )
                    )

        return len(interactions)

    async def remove_interaction(
        self, user_id: str, media_item_id: str, interaction_type: str
    ) -> bool:
        result = await self.session.execute(
            delete(UserMediaInteraction).where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.media_item_id == media_item_id,
                UserMediaInteraction.interaction_type == interaction_type,
            )
        )
        if result.rowcount == 0:
            return False

        await self._recalc_count(media_item_id, interaction_type)
        return True

    async def get_counts(self, media_item_id: str) -> dict[str, int]:
        media = await self.session.get(MediaItem, media_item_id)
        if media is None:
            return {"like_count": 0, "watchlist_count": 0, "watched_count": 0, "played_count": 0, "started_count": 0, "listened_count": 0}
        return {
            "like_count": media.like_count,
            "watchlist_count": media.watchlist_count,
            "watched_count": media.watched_count,
            "played_count": media.played_count,
            "started_count": media.started_count,
            "listened_count": media.listened_count,
        }

    async def list_user_interactions(
        self,
        user_id: str,
        interaction_type: str,
        cursor: str | None = None,
        limit: int = 50,
    ) -> tuple[list[MediaItem], bool, str | None]:
        query = (
            select(MediaItem, UserMediaInteraction.created_at)
            .join(
                UserMediaInteraction,
                UserMediaInteraction.media_item_id == MediaItem.id,
            )
            .options(
                joinedload(MediaItem.movie),
                joinedload(MediaItem.show),
                joinedload(MediaItem.game),
            )
            .where(
                UserMediaInteraction.user_id == user_id,
                UserMediaInteraction.interaction_type == interaction_type,
            )
            .order_by(
                UserMediaInteraction.created_at.desc(),
                MediaItem.id,
            )
        )

        if cursor:
            parts = cursor.split("__", 1)
            if len(parts) == 2:
                cursor_created_at, cursor_media_id = parts[0], parts[1]
                try:
                    cursor_dt = datetime.fromisoformat(cursor_created_at)
                    query = query.where(
                        (UserMediaInteraction.created_at < cursor_dt)
                        | (
                            (UserMediaInteraction.created_at == cursor_dt)
                            & (MediaItem.id > cursor_media_id)
                        )
                    )
                except ValueError:
                    pass

        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        rows = list(result.unique())

        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        items = [row[0] for row in rows]

        next_cursor = None
        if has_more and rows:
            last_item, last_created_at = rows[-1]
            next_cursor = f"{last_created_at.isoformat()}__{last_item.id}"

        return items, has_more, next_cursor

    async def _recalc_count(self, media_item_id: str, interaction_type: str) -> None:
        col_name = _TYPE_TO_COLUMN.get(interaction_type)
        if col_name is None:
            return

        # Single round-trip: UPDATE with a scalar subquery for the COUNT
        await self.session.execute(
            update(MediaItem)
            .where(MediaItem.id == media_item_id)
            .values(
                **{
                    col_name: select(func.count())
                    .select_from(UserMediaInteraction)
                    .where(
                        UserMediaInteraction.media_item_id == media_item_id,
                        UserMediaInteraction.interaction_type == interaction_type,
                    )
                    .scalar_subquery()
                }
            )
        )
