from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.list import UserList, UserListItem
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
        return True
