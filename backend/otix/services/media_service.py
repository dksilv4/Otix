from __future__ import annotations

from datetime import date

from sqlalchemy import case, false, literal_column, or_, select, func, text, type_coerce, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.user import User

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


def should_exclude_adult(user: User | None) -> bool:
    if user is None:
        return True
    if user.date_of_birth is None:
        return True
    today = date.today()
    dob = user.date_of_birth
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age < 18:
        return True
    return not user.show_adult_content


class MediaService:
    _has_embedding_column: bool | None = None

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_media(
        self,
        media_type: str | None = None,
        genre: str | None = None,
        has_artwork: bool = False,
        sort_by: str | None = None,
        sort_dir: str = "desc",
        cursor: str | None = None,
        page: int = 1,
        limit: int = 50,
        include_total: bool = False,
        date_from: date | None = None,
        date_to: date | None = None,
        media_ids: list[str] | None = None,
        language: str | None = None,
        is_anime: bool | None = None,
        exclude_adult: bool = False,
        certification: str | None = None,
        country_code: str = "us",
    ) -> tuple[list[MediaItem], bool, int | None]:
        _sort_fields = {
            "popularity": MediaItem.popularity,
            "rating": MediaItem.avg_rating,
            "release_date": MediaItem.release_date,
            "title": MediaItem.title,
        }
        # Financial sorts require a JOIN to the movies table
        _financial_sorts = {
            "revenue": Movie.revenue,
            "budget": Movie.budget,
            "profit": Movie.revenue - Movie.budget,
        }
        sort_field = _sort_fields.get(sort_by or "") or _financial_sorts.get(sort_by or "")
        is_financial_sort = sort_by in _financial_sorts

        if sort_field is not None:
            order = sort_field.desc().nullslast() if sort_dir == "desc" else sort_field.asc().nullsfirst()
        else:
            order = None

        if order is not None or is_financial_sort:
            query = select(MediaItem)
            if is_financial_sort:
                query = query.join(MediaItem.movie).options(joinedload(MediaItem.movie))
        else:
            # Cursor pagination with default popularity sort
            query = select(MediaItem)

        if order is not None:
            query = query.order_by(order, MediaItem.id)
        else:
            query = query.order_by(MediaItem.popularity.desc(), MediaItem.id)

        # Financial sorts only make sense for movies
        if is_financial_sort and not media_type:
            media_type = "movie"

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

        if media_ids:
            query = query.where(MediaItem.id.in_(media_ids))

        if language:
            query = query.where(MediaItem.original_language == language)

        if is_anime is not None:
            if is_anime:
                movie_cond = Movie.is_anime == True
                show_cond = Show.is_anime == True
            else:
                movie_cond = or_(Movie.is_anime == False, Movie.is_anime.is_(None))
                show_cond = or_(Show.is_anime == False, Show.is_anime.is_(None))
            if media_type == "movie":
                query = query.where(
                    MediaItem.id.in_(
                        select(Movie.media_item_id).where(movie_cond)
                    )
                )
            elif media_type == "show":
                query = query.where(
                    MediaItem.id.in_(
                        select(Show.media_item_id).where(show_cond)
                    )
                )

        if certification:
            from otix.domain.asset import MediaRelease
            query = query.where(
                MediaItem.id.in_(
                    select(MediaRelease.media_item_id).where(
                        MediaRelease.country_code == country_code,
                        MediaRelease.certification == certification,
                    )
                )
            )

        if exclude_adult:
            query = query.where(MediaItem.is_adult == False)

        if date_from is not None:
            query = query.where(MediaItem.release_date >= date_from)
        if date_to is not None:
            query = query.where(MediaItem.release_date <= date_to)

        total = None
        if include_total:
            count_query = select(func.count()).select_from(MediaItem)
            if media_type:
                count_query = count_query.where(MediaItem.media_type == media_type)
            if genre:
                count_query = count_query.join(MediaItem.genres).join(MediaGenre.genre).where(Genre.slug == genre)
            if has_artwork:
                count_query = count_query.where(
                    MediaItem.textless_poster_url.isnot(None)
                    | (
                        (MediaItem.media_type == "music")
                        & MediaItem.poster_url.isnot(None)
                    )
                )
            if language:
                count_query = count_query.where(MediaItem.original_language == language)
            if certification:
                from otix.domain.asset import MediaRelease
                count_query = count_query.where(
                    MediaItem.id.in_(
                        select(MediaRelease.media_item_id).where(
                            MediaRelease.country_code == country_code,
                            MediaRelease.certification == certification,
                        )
                    )
                )
            if is_anime is not None:
                if is_anime:
                    movie_cond = Movie.is_anime == True
                    show_cond = Show.is_anime == True
                else:
                    movie_cond = or_(Movie.is_anime == False, Movie.is_anime.is_(None))
                    show_cond = or_(Show.is_anime == False, Show.is_anime.is_(None))
                if media_type == "movie":
                    count_query = count_query.where(
                        MediaItem.id.in_(
                            select(Movie.media_item_id).where(movie_cond)
                        )
                    )
                elif media_type == "show":
                    count_query = count_query.where(
                        MediaItem.id.in_(
                            select(Show.media_item_id).where(show_cond)
                        )
                    )
            if exclude_adult:
                count_query = count_query.where(MediaItem.is_adult == False)
            if media_ids:
                count_query = count_query.where(MediaItem.id.in_(media_ids))
            if date_from is not None:
                count_query = count_query.where(MediaItem.release_date >= date_from)
            if date_to is not None:
                count_query = count_query.where(MediaItem.release_date <= date_to)
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
                selectinload(MediaItem.genres).joinedload(MediaGenre.genre),
                selectinload(MediaItem.external_ratings),
                selectinload(MediaItem.credits).joinedload(MediaCredit.person),
                selectinload(MediaItem.involved_companies).joinedload(InvolvedCompany.company),
                selectinload(MediaItem.releases),
                selectinload(MediaItem.platforms).joinedload(MediaPlatform.platform),
                selectinload(MediaItem.game_modes).joinedload(MediaGameMode.game_mode),
                # Type-specific: use selectinload for collections to avoid cartesian blowup
                joinedload(MediaItem.movie).joinedload(Movie.collection).selectinload(Collection.movies).joinedload(Movie.media_item),
                joinedload(MediaItem.show).selectinload(Show.seasons).selectinload(Season.episodes).selectinload(Episode.external_ratings),
                joinedload(MediaItem.game),
                joinedload(MediaItem.album).selectinload(Album.tracks),
            )
            .where(MediaItem.id == media_id)
        )

        if item is None:
            return None

        # Movie ranking queries — count(*) with index scan, ~1ms each
        if item.movie is not None and item.movie.revenue:
            rank = await self.session.scalar(
                select(func.count()).select_from(Movie).where(Movie.revenue > item.movie.revenue)
            )
            if rank is not None:
                item.movie.revenue_rank = rank + 1

        if item.movie is not None and item.movie.budget and item.movie.revenue:
            movie = item.movie
            profit_pct = round(((movie.revenue - movie.budget) / movie.budget) * 100, 1)
            movie.profit_pct = profit_pct

            profit_abs = movie.revenue - movie.budget
            profit_expr = Movie.revenue - Movie.budget

            higher = await self.session.scalar(
                select(func.count()).select_from(Movie).where(
                    Movie.budget > 0, Movie.revenue.isnot(None), profit_expr > profit_abs
                )
            )
            if higher is not None:
                movie.profit_rank = higher + 1

            lower = await self.session.scalar(
                select(func.count()).select_from(Movie).where(
                    Movie.budget > 0, Movie.revenue.isnot(None), profit_expr < profit_abs
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
        exclude_adult: bool = False,
    ) -> tuple[list[MediaItem], int]:
        tsquery = func.plainto_tsquery("english", query_str)

        # Three independent index-backed search branches combined via UNION.
        # OR conditions force PostgreSQL into a sequential scan; UNION lets each
        # branch use its dedicated index (GIN on search_vector, GiST trigram on
        # title, GIN trigram on people.name + FK on media_credits).
        fts_ids = select(MediaItem.id).where(MediaItem.search_vector.op("@@")(tsquery))
        fuzzy_ids = select(MediaItem.id).where(MediaItem.title.op("%")(query_str))
        credit_ids = (
            select(MediaItem.id)
            .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(Person.name.ilike(f"%{query_str}%"))
        )

        matched_ids = union(fts_ids, fuzzy_ids, credit_ids).subquery()

        # Whether an item was matched via credit/person (for ranking boost).
        credit_person_match = (
            select(1)
            .select_from(MediaCredit)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(
                MediaCredit.media_item_id == MediaItem.id,
                Person.name.ilike(f"%{query_str}%"),
            )
            .exists()
        )

        base_q = select(MediaItem).where(MediaItem.id.in_(select(matched_ids)))
        if media_type:
            base_q = base_q.where(MediaItem.media_type == media_type)
        if exclude_adult:
            base_q = base_q.where(MediaItem.is_adult == False)

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
            if MediaService._has_embedding_column is None:
                col_check = await self.session.execute(
                    text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='media_items' AND column_name='embedding')")
                )
                MediaService._has_embedding_column = col_check.scalar_one()

            if MediaService._has_embedding_column:
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

        # Paginate — fetch one extra row to determine has_more without COUNT.
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size + 1)

        result = await self.session.scalars(q)
        items = list(result)
        has_more = len(items) > page_size
        if has_more:
            items = items[:page_size]

        # Only count on page 1 (for "X results" display).
        if page == 1:
            count_q = select(func.count()).select_from(matched_ids)
            total_result = await self.session.execute(count_q)
            total = total_result.scalar_one()
        else:
            total = None

        return items, total, has_more

    async def get_media_items_by_ids(self, ids: list[str]) -> list[MediaItem]:
        if not ids:
            return []
        result = await self.session.scalars(
            select(MediaItem).where(MediaItem.id.in_(ids))
        )
        items = list(result)
        id_order = {id_: idx for idx, id_ in enumerate(ids)}
        items.sort(key=lambda item: id_order.get(item.id, 999))
        return items
