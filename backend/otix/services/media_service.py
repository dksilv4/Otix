from __future__ import annotations

from sqlalchemy import case, false, literal_column, select, func, text, type_coerce
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.company import InvolvedCompany
from otix.domain.media import (
    Album,
    Episode,
    MediaGameMode,
    MediaItem,
    MediaPlatform,
    Movie,
    Season,
    Show,
)
from otix.domain.collection import Collection
from otix.domain.genre import Genre, MediaGenre
from otix.domain.people import MediaCredit, Person


class MediaService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_media(
        self,
        media_type: str | None = None,
        genre: str | None = None,
        has_artwork: bool = False,
        sort_by: str | None = None,
        cursor: str | None = None,
        page: int = 1,
        limit: int = 50,
        include_total: bool = False,
    ) -> tuple[list[MediaItem], bool, int | None]:
        sort_map = {
            "popularity": MediaItem.popularity.desc(),
            "rating": MediaItem.avg_rating.desc().nullslast(),
            "release_date": MediaItem.release_date.desc().nullslast(),
            "title": MediaItem.title.asc(),
        }
        order = sort_map.get(sort_by or "") if sort_by else None

        if order is not None:
            # Offset pagination when a sort is explicitly requested
            query = select(MediaItem).order_by(order, MediaItem.id)
        else:
            # Cursor pagination with default popularity sort
            query = (
                select(MediaItem)
                .order_by(MediaItem.popularity.desc(), MediaItem.id)
            )

        if media_type:
            query = query.where(MediaItem.media_type == media_type)

        if has_artwork:
            # Movies/shows/games need textless poster; music uses poster_url
            # (album covers have artwork text, no "textless" variant exists).
            query = query.where(
                MediaItem.textless_poster_url.isnot(None)
                | (
                    (MediaItem.media_type == "music")
                    & MediaItem.poster_url.isnot(None)
                )
            )

        if genre:
            query = query.join(MediaItem.genres).join(MediaGenre.genre).where(Genre.slug == genre)

        total = None
        if include_total:
            count_query = select(func.count()).select_from(MediaItem)
            if media_type:
                count_query = count_query.where(MediaItem.media_type == media_type)
            if genre:
                count_query = count_query.join(MediaItem.genres).join(MediaGenre.genre).where(Genre.slug == genre)
            total = await self.session.scalar(count_query)

        if order is not None:
            # Offset pagination for sorted queries
            offset = (page - 1) * limit
            query = query.offset(offset).limit(limit + 1)
            result = await self.session.scalars(query)
            items = list(result)
            has_more = len(items) > limit
            if has_more:
                items = items[:limit]
        else:
            # Cursor pagination with (popularity, id) ordering
            if cursor:
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

        return items, has_more, total

    async def get_media_item(self, media_id: str) -> MediaItem | None:
        item = await self.session.scalar(
            select(MediaItem)
            .options(
                joinedload(MediaItem.movie).joinedload(Movie.collection).selectinload(Collection.movies).joinedload(Movie.media_item),
                joinedload(MediaItem.show).selectinload(Show.seasons).selectinload(Season.episodes).selectinload(Episode.external_ratings),
                joinedload(MediaItem.game),
                joinedload(MediaItem.album).selectinload(Album.tracks),
                selectinload(MediaItem.genres).joinedload(MediaGenre.genre),
                selectinload(MediaItem.external_ratings),
                selectinload(MediaItem.credits).joinedload(MediaCredit.person),
                selectinload(MediaItem.involved_companies).joinedload(InvolvedCompany.company),
                selectinload(MediaItem.platforms).joinedload(MediaPlatform.platform),
                selectinload(MediaItem.game_modes).joinedload(MediaGameMode.game_mode),
            )
            .where(MediaItem.id == media_id)
        )

        if item is not None and item.movie is not None and item.movie.revenue:
            rank = await self.session.scalar(
                select(func.count()).select_from(Movie).where(Movie.revenue > item.movie.revenue)
            )
            if rank is not None:
                item.movie.revenue_rank = rank + 1

        if item is not None and item.movie is not None and item.movie.budget and item.movie.revenue:
            movie = item.movie
            profit_pct = round(((movie.revenue - movie.budget) / movie.budget) * 100, 1)
            movie.profit_pct = profit_pct

            profit_abs = movie.revenue - movie.budget
            profit_expr = Movie.revenue - Movie.budget

            higher = await self.session.scalar(
                select(func.count()).select_from(Movie).where(
                    Movie.budget > 0,
                    Movie.revenue.isnot(None),
                    profit_expr > profit_abs,
                )
            )
            if higher is not None:
                movie.profit_rank = higher + 1

            lower = await self.session.scalar(
                select(func.count()).select_from(Movie).where(
                    Movie.budget > 0,
                    Movie.revenue.isnot(None),
                    profit_expr < profit_abs,
                )
            )
            if lower is not None:
                movie.loss_rank = lower + 1

        return item

    async def search_media(
        self,
        query_str: str,
        media_type: str | None = None,
        sort_by: str | None = None,
        page: int = 1,
        page_size: int = 24,
        query_embedding: list[float] | None = None,
    ) -> tuple[list[MediaItem], int]:
        tsquery = func.plainto_tsquery("english", query_str)

        # Hybrid: full-text on precomputed search_vector + trigram fuzzy match.
        # Person/artist credits are matched separately so music searches like
        # "Ariana Grande" can return albums even when the title does not include
        # the artist name.
        fts_match = MediaItem.search_vector.op("@@")(tsquery)
        fuzzy_match = func.similarity(MediaItem.title, query_str) > 0.2
        credit_media_ids = list(
            await self.session.scalars(
                select(MediaCredit.media_item_id)
                .join(Person, Person.id == MediaCredit.person_id)
                .where(Person.name.ilike(f"%{query_str}%"))
                .distinct()
                .limit(500)
            )
        )
        credit_person_match = (
            MediaItem.id.in_(credit_media_ids)
            if credit_media_ids
            else false()
        )

        base_q = select(MediaItem).where(fts_match | fuzzy_match | credit_person_match)
        if media_type:
            base_q = base_q.where(MediaItem.media_type == media_type)

        # Count total before pagination
        count_q = select(func.count()).select_from(base_q.subquery())
        total_result = await self.session.execute(count_q)
        total = total_result.scalar_one()

        # Ranking: blend ts_rank, trigram similarity, vector similarity, credit
        # matches, and popularity.
        relevance = func.coalesce(func.ts_rank(MediaItem.search_vector, tsquery), 0)
        sim = func.similarity(MediaItem.title, query_str)
        credit_boost = case((credit_person_match, 2), else_=0)
        popularity_boost = func.ln(func.greatest(MediaItem.popularity, 1))

        # Vector similarity via cosine distance (pgvector). Falls back to 0 when
        # no embedding column exists (pgvector unavailable), no embedding for the
        # item, or no query embedding was provided.
        if query_embedding is not None:
            col_check = await self.session.execute(
                text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='media_items' AND column_name='embedding')")
            )
            if col_check.scalar_one():
                from pgvector.sqlalchemy import Vector
                vector_sim = func.coalesce(
                    1 - literal_column('embedding').op('<=>')(type_coerce(query_embedding, Vector(384))),
                    0,
                )
            else:
                vector_sim = 0
        else:
            vector_sim = 0

        sort_map = {
            "popularity": MediaItem.popularity.desc(),
            "rating": MediaItem.avg_rating.desc().nullslast(),
            "release_date": MediaItem.release_date.desc().nullslast(),
            "title": MediaItem.title.asc(),
        }
        if sort_by:
            order = sort_map[sort_by]
        else:
            order = (
                relevance * 10 + sim * 5 + credit_boost + vector_sim * 3 + popularity_boost * 0.5
            ).desc()

        q = base_q.order_by(order)

        # Paginate
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        result = await self.session.scalars(q)
        return list(result), total
