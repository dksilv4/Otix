from __future__ import annotations

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.blueprint import Blueprint, BlueprintLike


class BlueprintService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: str,
        title: str,
        description: str | None,
        blueprint_string: str,
        parsed_data: dict | None,
        tags: list[str] | None,
    ) -> Blueprint:
        bp = Blueprint(
            user_id=user_id,
            title=title,
            description=description,
            blueprint_string=blueprint_string,
            parsed_data=parsed_data,
            tags=tags,
        )
        self.session.add(bp)
        await self.session.flush()
        await self.session.refresh(bp)
        return bp

    async def get(self, blueprint_id: str) -> Blueprint | None:
        return await self.session.scalar(
            select(Blueprint).options(joinedload(Blueprint.user)).where(Blueprint.id == blueprint_id)
        )

    async def update(
        self,
        blueprint_id: str,
        user_id: str,
        title: str | None,
        description: str | None,
        blueprint_string: str | None,
        parsed_data: dict | None,
        tags: list[str] | None,
    ) -> Blueprint | None:
        bp = await self.session.scalar(
            select(Blueprint).where(
                Blueprint.id == blueprint_id,
                Blueprint.user_id == user_id,
            )
        )
        if bp is None:
            return None
        if title is not None:
            bp.title = title
        if description is not None:
            bp.description = description
        if blueprint_string is not None:
            bp.blueprint_string = blueprint_string
        if parsed_data is not None:
            bp.parsed_data = parsed_data
        if tags is not None:
            bp.tags = tags
        await self.session.flush()
        await self.session.refresh(bp)
        return bp

    async def delete(self, blueprint_id: str, user_id: str) -> bool:
        result = await self.session.execute(
            delete(Blueprint).where(
                Blueprint.id == blueprint_id,
                Blueprint.user_id == user_id,
            )
        )
        return result.rowcount > 0

    async def list(
        self,
        search: str | None = None,
        sort: str = "created_at",
        offset: int = 0,
        limit: int = 20,
        current_user_id: str | None = None,
    ) -> tuple[list[Blueprint], int]:
        query = select(Blueprint).options(joinedload(Blueprint.user))

        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    Blueprint.title.ilike(pattern),
                    Blueprint.description.ilike(pattern),
                )
            )

        if sort == "downloads":
            query = query.order_by(Blueprint.downloads.desc(), Blueprint.created_at.desc())
        else:
            query = query.order_by(Blueprint.created_at.desc())

        # Count total matching results
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.session.scalar(count_query) or 0

        query = query.offset(offset).limit(limit)
        result = await self.session.scalars(query)
        items = list(result)

        return items, total

    async def get_likes_count(self, blueprint_id: str) -> int:
        return (
            await self.session.scalar(
                select(func.count(BlueprintLike.id)).where(
                    BlueprintLike.blueprint_id == blueprint_id,
                )
            )
            or 0
        )

    async def get_has_liked(self, blueprint_id: str, user_id: str) -> bool:
        like = await self.session.scalar(
            select(BlueprintLike).where(
                BlueprintLike.blueprint_id == blueprint_id,
                BlueprintLike.user_id == user_id,
            )
        )
        return like is not None

    async def like_toggle(self, blueprint_id: str, user_id: str) -> tuple[bool, int]:
        """Toggle like for a blueprint. Returns (is_liked, like_count)."""
        existing = await self.session.scalar(
            select(BlueprintLike).where(
                BlueprintLike.blueprint_id == blueprint_id,
                BlueprintLike.user_id == user_id,
            )
        )

        if existing is not None:
            await self.session.delete(existing)
            is_liked = False
        else:
            self.session.add(BlueprintLike(blueprint_id=blueprint_id, user_id=user_id))
            is_liked = True

        await self.session.flush()

        count = (
            await self.session.scalar(
                select(func.count(BlueprintLike.id)).where(
                    BlueprintLike.blueprint_id == blueprint_id,
                )
            )
            or 0
        )

        return is_liked, count

    async def increment_downloads(self, blueprint_id: str) -> Blueprint | None:
        bp = await self.session.scalar(select(Blueprint).where(Blueprint.id == blueprint_id))
        if bp is None:
            return None
        bp.downloads += 1
        await self.session.flush()
        await self.session.refresh(bp)
        return bp
