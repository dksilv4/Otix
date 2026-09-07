# TODO: Review this file
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.domain.media import MediaItem, Season, Show
from otix.domain.people import MediaCredit, Person, UserPersonFollow
from otix.services.asset_selection import enrich_items_with_assets


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

    async def get_person(self, person_id: str, user_id: str | None = None) -> Person | None:
        person = await self.session.scalar(
            select(Person)
            .options(
                selectinload(Person.credits)
                .joinedload(MediaCredit.media_item)
                .joinedload(MediaItem.show)
                .selectinload(Show.seasons)
                .selectinload(Season.episodes),
                selectinload(Person._external_ids),
            )
            .where(Person.id == person_id)
        )
        if person is None:
            return None

        # Safety: filter out credits whose media_item no longer exists
        person.credits = [c for c in person.credits if c.media_item is not None]

        # Resolve asset URLs for credit media items before serialization
        await enrich_items_with_assets(self.session, [c.media_item for c in person.credits])

        # Sort credits by release_date descending, nulls last
        null_credits = [c for c in person.credits if not c.media_item.release_date]
        dated_credits = [c for c in person.credits if c.media_item.release_date]
        dated_credits.sort(key=lambda c: c.media_item.release_date, reverse=True)  # type: ignore[arg-type]
        person.credits = dated_credits + null_credits

        # Get follower count (resilient to migration not yet applied)
        try:
            follow_count = await self.session.scalar(
                select(func.count()).where(UserPersonFollow.person_id == person_id)
            )
            person.follower_count = follow_count or 0
        except Exception:
            person.follower_count = 0

        # Check if user follows this person
        person.is_followed = None
        if user_id:
            try:
                follow = await self.session.scalar(
                    select(UserPersonFollow).where(
                        UserPersonFollow.user_id == user_id,
                        UserPersonFollow.person_id == person_id,
                    )
                )
                person.is_followed = follow is not None
            except Exception:
                person.is_followed = False

        # Rating info
        person.avg_rating = None
        person.user_rating = None
        person.rating_count = 0
        try:
            from otix.domain.people import PersonRating
            res = await self.session.execute(
                select(func.avg(PersonRating.score), func.count(PersonRating.id)).where(
                    PersonRating.person_id == person_id
                )
            )
            avg, count = res.first()
            if avg is not None:
                person.avg_rating = round(float(avg), 1)
            person.rating_count = count or 0

            if user_id:
                user_score = await self.session.scalar(
                    select(PersonRating.score).where(
                        PersonRating.user_id == user_id,
                        PersonRating.person_id == person_id,
                    )
                )
                person.user_rating = user_score
        except Exception:
            pass

        return person

    async def rate_person(self, user_id: str, person_id: str, score: int) -> None:
        from otix.domain.people import PersonRating
        rating = await self.session.scalar(
            select(PersonRating).where(
                PersonRating.user_id == user_id,
                PersonRating.person_id == person_id,
            )
        )
        if rating:
            rating.score = score
        else:
            self.session.add(PersonRating(user_id=user_id, person_id=person_id, score=score))
        await self.session.flush()

    async def unrate_person(self, user_id: str, person_id: str) -> bool:
        from otix.domain.people import PersonRating
        rating = await self.session.scalar(
            select(PersonRating).where(
                PersonRating.user_id == user_id,
                PersonRating.person_id == person_id,
            )
        )
        if not rating:
            return False
        await self.session.delete(rating)
        await self.session.flush()
        return True

    async def search_people(
        self,
        query_str: str,
        limit: int = 50,
        query_embedding: list[float] | None = None,
    ) -> list[Person]:
        from sqlalchemy import union

        fts_q = select(Person.id).where(Person.name.op("%")(query_str), Person.embedding.isnot(None))
        branches = [fts_q]
        if query_embedding is not None and query_embedding is not None:
            vector_q = (
                select(Person.id)
                .where(Person.embedding.isnot(None))
                .order_by(Person.embedding.cosine_distance(query_embedding))
                .limit(limit)
            )
            branches.append(vector_q)

        matched_ids = union(*branches).subquery()

        base_q = select(Person).where(
            Person.id.in_(select(matched_ids)),
            Person.embedding.isnot(None),
        )

        sim = func.similarity(Person.name, query_str)
        if query_embedding is not None and query_embedding is not None:
            vector_sim = func.coalesce(1 - Person.embedding.cosine_distance(query_embedding), 0)
        else:
            vector_sim = 0

        order = (sim * 5 + vector_sim * 5).desc()
        q = base_q.order_by(order).limit(limit)

        result = await self.session.scalars(q)
        items = list(result)

        # Dedup by name — cross-provider imports can create duplicates.
        seen_names: set[str] = set()
        unique_people: list[Person] = []
        for p in items:
            key = p.name.lower()
            if key not in seen_names:
                seen_names.add(key)
                unique_people.append(p)
        return unique_people
