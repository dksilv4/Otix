from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.media import MediaItem
from otix.domain.people import MediaCredit, Person


class PeopleService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_people(
        self,
        cursor: str | None = None,
        limit: int = 50,
    ) -> tuple[list[Person], bool]:
        query = (
            select(Person)
            .order_by(Person.name, Person.id)
        )

        if cursor:
            cursor_person = await self.session.scalar(
                select(Person).where(Person.id == cursor)
            )
            if cursor_person is not None:
                query = query.where(
                    (Person.name > cursor_person.name)
                    | ((Person.name == cursor_person.name) & (Person.id > cursor_person.id))
                )

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def get_person(self, person_id: str) -> Person | None:
        return await self.session.scalar(
            select(Person)
            .options(
                selectinload(Person.credits)
                .joinedload(MediaCredit.media_item),
            )
            .where(Person.id == person_id)
        )

    async def search_people(
        self,
        query_str: str,
        limit: int = 50,
    ) -> list[Person]:
        q = (
            select(Person)
            .where(Person.name.ilike(f"%{query_str}%"))
            .order_by(Person.name)
            .limit(limit)
        )
        result = await self.session.scalars(q)
        return list(result)
