from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.list import (
    ListItemRankHistory,
    MediaListCollaborator,
    MediaListLike,
    UserList,
    UserListItem,
)
from otix.domain.media import MediaItem
from otix.infrastructure.celery import app
from otix.lib.xp import LIST_CREATE


class ListService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_list(
        self, user_id: str, name: str, description: str | None, is_public: bool
    ) -> UserList:
        lst = UserList(
            user_id=user_id,
            name=name,
            description=description,
            is_public=is_public,
        )
        self.session.add(lst)
        await self.session.flush()
        await self.session.refresh(lst)
        app.send_task("xp.award", args=[user_id, LIST_CREATE])
        app.send_task("streak.update", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])
        return lst

    async def update_list(
        self,
        list_id: str,
        user_id: str,
        name: str | None,
        description: str | None,
        is_public: bool | None,
    ) -> UserList | None:
        lst = await self.session.scalar(
            select(UserList).where(
                UserList.id == list_id,
                UserList.user_id == user_id,
            )
        )
        if lst is None:
            return None
        if name is not None:
            lst.name = name
        if description is not None:
            lst.description = description
        if is_public is not None:
            lst.is_public = is_public
        await self.session.flush()
        await self.session.refresh(lst)
        return lst

    async def delete_list(self, list_id: str, user_id: str) -> bool:
        result = await self.session.execute(
            delete(UserList).where(
                UserList.id == list_id,
                UserList.user_id == user_id,
            )
        )
        return result.rowcount > 0

    async def get_list(self, list_id: str) -> UserList | None:
        return await self.session.scalar(
            select(UserList).where(UserList.id == list_id)
        )

    async def get_list_with_items(self, list_id: str) -> UserList | None:
        return await self.session.scalar(
            select(UserList)
            .options(
                joinedload(UserList.items)
                .joinedload(UserListItem.media_item)
                .joinedload(MediaItem.movie),
                joinedload(UserList.items)
                .joinedload(UserListItem.media_item)
                .joinedload(MediaItem.show),
                joinedload(UserList.items)
                .joinedload(UserListItem.media_item)
                .joinedload(MediaItem.game),
            )
            .where(UserList.id == list_id)
        )

    async def list_user_lists(self, user_id: str) -> list[UserList]:
        result = await self.session.scalars(
            select(UserList)
            .where(UserList.user_id == user_id)
            .order_by(UserList.updated_at.desc())
        )
        return list(result)

    async def list_public_lists(
        self, cursor: str | None = None, limit: int = 50
    ) -> tuple[list[UserList], bool]:
        query = (
            select(UserList)
            .options(joinedload(UserList.user))
            .where(UserList.is_public == True)  # noqa: E712
            .order_by(UserList.updated_at.desc())
        )

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def add_item(
        self, list_id: str, user_id: str, media_item_id: str
    ) -> UserListItem | None:
        lst = await self.session.scalar(
            select(UserList).where(
                UserList.id == list_id,
                UserList.user_id == user_id,
            )
        )
        if lst is None:
            return None

        max_order = await self.session.scalar(
            select(func.coalesce(func.max(UserListItem.sort_order), -1)).where(
                UserListItem.list_id == list_id,
            )
        )

        item = UserListItem(
            list_id=list_id,
            media_item_id=media_item_id,
            sort_order=max_order + 1 if max_order is not None else 0,
        )
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def remove_item(
        self, list_id: str, user_id: str, media_item_id: str
    ) -> bool:
        lst = await self.session.scalar(
            select(UserList).where(
                UserList.id == list_id,
                UserList.user_id == user_id,
            )
        )
        if lst is None:
            return False

        result = await self.session.execute(
            delete(UserListItem).where(
                UserListItem.list_id == list_id,
                UserListItem.media_item_id == media_item_id,
            )
        )
        return result.rowcount > 0

    async def reorder_items(
        self, list_id: str, user_id: str, media_item_ids: list[str]
    ) -> bool:
        lst = await self.session.scalar(
            select(UserList).where(
                UserList.id == list_id,
                UserList.user_id == user_id,
            )
        )
        if lst is None:
            return False

        for i, media_item_id in enumerate(media_item_ids):
            await self.session.execute(
                update(UserListItem)
                .where(UserListItem.list_id == list_id, UserListItem.media_item_id == media_item_id)
                .values(sort_order=i)
            )

        await self.session.flush()

        # Record rank history entries
        for i, media_item_id in enumerate(media_item_ids):
            old_order = await self.session.scalar(
                select(UserListItem.sort_order).where(
                    UserListItem.list_id == list_id,
                    UserListItem.media_item_id == media_item_id,
                )
            )
            if old_order is not None and old_order != i:
                self.session.add(
                    ListItemRankHistory(
                        list_id=list_id,
                        media_item_id=media_item_id,
                        user_id=user_id,
                        old_sort_order=old_order,
                        new_sort_order=i,
                    )
                )

        await self.session.flush()
        return True

    # ── Collaborators ──────────────────────────────────────────

    async def add_collaborator(
        self, list_id: str, actor_id: str, target_user_id: str, permission: str
    ) -> MediaListCollaborator | None:
        lst = await self._get_owned_list(list_id, actor_id)
        if lst is None:
            return None

        collab = MediaListCollaborator(
            list_id=list_id,
            user_id=target_user_id,
            permission=permission,
            status="pending",
        )
        self.session.add(collab)
        await self.session.flush()
        await self.session.refresh(collab)
        return collab

    async def remove_collaborator(
        self, list_id: str, actor_id: str, target_user_id: str
    ) -> bool:
        lst = await self._get_owned_list(list_id, actor_id)
        if lst is None:
            return False

        result = await self.session.execute(
            delete(MediaListCollaborator).where(
                MediaListCollaborator.list_id == list_id,
                MediaListCollaborator.user_id == target_user_id,
            )
        )
        return result.rowcount > 0

    async def accept_collaboration(
        self, list_id: str, user_id: str
    ) -> bool:
        result = await self.session.execute(
            update(MediaListCollaborator)
            .where(
                MediaListCollaborator.list_id == list_id,
                MediaListCollaborator.user_id == user_id,
                MediaListCollaborator.status == "pending",
            )
            .values(status="accepted")
        )
        return result.rowcount > 0

    async def decline_collaboration(
        self, list_id: str, user_id: str
    ) -> bool:
        result = await self.session.execute(
            delete(MediaListCollaborator).where(
                MediaListCollaborator.list_id == list_id,
                MediaListCollaborator.user_id == user_id,
                MediaListCollaborator.status == "pending",
            )
        )
        return result.rowcount > 0

    async def get_collaborators(self, list_id: str) -> list[MediaListCollaborator]:
        result = await self.session.scalars(
            select(MediaListCollaborator)
            .options(joinedload(MediaListCollaborator.user))
            .where(MediaListCollaborator.list_id == list_id)
        )
        return list(result)

    async def list_collaborations(self, user_id: str) -> list[MediaListCollaborator]:
        result = await self.session.scalars(
            select(MediaListCollaborator)
            .options(joinedload(MediaListCollaborator.list))
            .where(
                MediaListCollaborator.user_id == user_id,
                MediaListCollaborator.status == "accepted",
            )
        )
        return list(result)

    async def _get_owned_list(self, list_id: str, user_id: str) -> UserList | None:
        """Get list if user is owner or has EDIT/ADMIN collaborator permission."""
        lst = await self.session.scalar(
            select(UserList).where(UserList.id == list_id)
        )
        if lst is None:
            return None
        if lst.user_id == user_id:
            return lst

        collab = await self.session.scalar(
            select(MediaListCollaborator).where(
                MediaListCollaborator.list_id == list_id,
                MediaListCollaborator.user_id == user_id,
                MediaListCollaborator.status == "accepted",
                MediaListCollaborator.permission.in_(["EDIT", "ADMIN"]),
            )
        )
        return lst if collab is not None else None

    async def _can_access_list(self, list_id: str, user_id: str) -> bool:
        """Check if user can view/modify the list (owner or accepted collaborator)."""
        lst = await self.session.scalar(
            select(UserList).where(UserList.id == list_id)
        )
        if lst is None:
            return False
        if lst.user_id == user_id:
            return True

        collab = await self.session.scalar(
            select(MediaListCollaborator).where(
                MediaListCollaborator.list_id == list_id,
                MediaListCollaborator.user_id == user_id,
                MediaListCollaborator.status == "accepted",
            )
        )
        return collab is not None

    # ── Likes ──────────────────────────────────────────────────

    async def like_list(self, list_id: str, user_id: str) -> bool:
        existing = await self.session.scalar(
            select(MediaListLike).where(
                MediaListLike.list_id == list_id,
                MediaListLike.user_id == user_id,
            )
        )
        if existing is not None:
            return False

        self.session.add(MediaListLike(list_id=list_id, user_id=user_id))
        await self.session.flush()
        return True

    async def unlike_list(self, list_id: str, user_id: str) -> bool:
        result = await self.session.execute(
            delete(MediaListLike).where(
                MediaListLike.list_id == list_id,
                MediaListLike.user_id == user_id,
            )
        )
        return result.rowcount > 0

    async def get_like_status(
        self, list_id: str, user_id: str | None = None
    ) -> tuple[int, bool]:
        count = await self.session.scalar(
            select(func.count(MediaListLike.id)).where(
                MediaListLike.list_id == list_id,
            )
        ) or 0

        is_liked = False
        if user_id is not None:
            like = await self.session.scalar(
                select(MediaListLike).where(
                    MediaListLike.list_id == list_id,
                    MediaListLike.user_id == user_id,
                )
            )
            is_liked = like is not None

        return count, is_liked

    # ── Rank history ───────────────────────────────────────────

    async def get_rank_history(
        self, list_id: str, limit: int = 50
    ) -> list[ListItemRankHistory]:
        result = await self.session.scalars(
            select(ListItemRankHistory)
            .options(
                joinedload(ListItemRankHistory.media_item),
                joinedload(ListItemRankHistory.user),
            )
            .where(ListItemRankHistory.list_id == list_id)
            .order_by(ListItemRankHistory.changed_at.desc())
            .limit(limit)
        )
        return list(result)
