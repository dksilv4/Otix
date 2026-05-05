from __future__ import annotations

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.company import InvolvedCompany, Company
from otix.domain.media import (
    GameMode,
    MediaGameMode,
    MediaItem,
    MediaPlatform,
    Movie,
    Platform,
    Show,
    Game,
)
from otix.domain.genre import Genre, MediaGenre
from otix.domain.people import MediaCredit, Person
from otix.domain.asset import ExternalRating


class MediaService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_media(
        self,
        media_type: str | None = None,
        genre: str | None = None,
        has_artwork: bool = False,
        cursor: str | None = None,
        limit: int = 50,
    ) -> tuple[list[MediaItem], bool]:
        query = (
            select(MediaItem)
            .order_by(MediaItem.popularity.desc(), MediaItem.id)
        )

        if media_type:
            query = query.where(MediaItem.media_type == media_type)

        if has_artwork:
            query = query.where(MediaItem.textless_poster_url.isnot(None))

        if genre:
            query = query.join(MediaItem.genres).join(MediaGenre.genre).where(Genre.slug == genre)

        if cursor:
            # Cursor is (popularity, id) for stable pagination.
            sub = (
                select(MediaItem)
                .where(MediaItem.id == cursor)
            )
            cursor_item = await self.session.scalar(sub)
            if cursor_item is not None:
                query = query.where(
                    (MediaItem.popularity < cursor_item.popularity)
                    | ((MediaItem.popularity == cursor_item.popularity) & (MediaItem.id > cursor_item.id))
                )

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def get_media_item(self, media_id: str) -> MediaItem | None:
        return await self.session.scalar(
            select(MediaItem)
            .options(
                joinedload(MediaItem.movie),
                joinedload(MediaItem.show).selectinload(Show.seasons),
                joinedload(MediaItem.game),
                selectinload(MediaItem.genres).joinedload(MediaGenre.genre),
                selectinload(MediaItem.external_ratings),
                selectinload(MediaItem.credits).joinedload(MediaCredit.person),
                selectinload(MediaItem.involved_companies).joinedload(InvolvedCompany.company),
                selectinload(MediaItem.platforms).joinedload(MediaPlatform.platform),
                selectinload(MediaItem.game_modes).joinedload(MediaGameMode.game_mode),
            )
            .where(MediaItem.id == media_id)
        )

    async def search_media(
        self,
        query_str: str,
        media_type: str | None = None,
        limit: int = 50,
    ) -> list[MediaItem]:
        # Full-text search using PostgreSQL tsvector.
        tsquery = func.plainto_tsquery("english", query_str)

        q = (
            select(MediaItem)
            .where(MediaItem.search_vector.op("@@")(tsquery))
            .order_by(func.ts_rank(MediaItem.search_vector, tsquery).desc())
            .limit(limit)
        )

        if media_type:
            q = q.where(MediaItem.media_type == media_type)

        result = await self.session.scalars(q)
        return list(result)
