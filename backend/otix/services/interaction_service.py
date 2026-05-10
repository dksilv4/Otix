from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import MediaItem
from otix.infrastructure.celery import app
from otix.lib.xp import INTERACTION_LIKE_WATCHLIST_STARTED, INTERACTION_WATCHED_PLAYED

_TYPE_TO_COLUMN: dict[str, str] = {
    "liked": "like_count",
    "watchlisted": "watchlist_count",
    "watched": "watched_count",
    "played": "played_count",
    "started": "started_count",
}

_VALID_TYPES = frozenset(_TYPE_TO_COLUMN)


class InteractionService:
    def __init__(self, session: AsyncSession):
        self.session = session

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
                if interaction_type in ("watched", "played")
                else INTERACTION_LIKE_WATCHLIST_STARTED
            )
            app.send_task("xp.award", args=[user_id, amount])

        return existing

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
            return {"like_count": 0, "watchlist_count": 0, "watched_count": 0, "played_count": 0, "started_count": 0}
        return {
            "like_count": media.like_count,
            "watchlist_count": media.watchlist_count,
            "watched_count": media.watched_count,
            "played_count": media.played_count,
            "started_count": media.started_count,
        }

    async def list_user_interactions(
        self,
        user_id: str,
        interaction_type: str,
        cursor: str | None = None,
        limit: int = 50,
    ) -> tuple[list[MediaItem], bool, str | None]:
        query = (
            select(MediaItem)
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
        result = await self.session.scalars(query)
        items = list(result.unique())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last_item = items[-1]
            last_interaction = await self.session.scalar(
                select(UserMediaInteraction).where(
                    UserMediaInteraction.user_id == user_id,
                    UserMediaInteraction.media_item_id == last_item.id,
                    UserMediaInteraction.interaction_type == interaction_type,
                )
            )
            if last_interaction:
                next_cursor = f"{last_interaction.created_at.isoformat()}__{last_item.id}"

        return items, has_more, next_cursor

    async def _recalc_count(self, media_item_id: str, interaction_type: str) -> None:
        col_name = _TYPE_TO_COLUMN.get(interaction_type)
        if col_name is None:
            return

        count_result = await self.session.scalar(
            select(func.count()).select_from(UserMediaInteraction).where(
                UserMediaInteraction.media_item_id == media_item_id,
                UserMediaInteraction.interaction_type == interaction_type,
            )
        )
        count = count_result if count_result is not None else 0

        await self.session.execute(
            update(MediaItem)
            .where(MediaItem.id == media_item_id)
            .values(**{col_name: count})
        )
