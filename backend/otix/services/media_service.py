# TODO: Review this file
from __future__ import annotations

from datetime import date

from sqlalchemy import and_, case, false, or_, select, func, type_coerce, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.user import User

from otix.domain.company import InvolvedCompany
from otix.domain.media import (
    Album,
    Episode,
    Game,
    MediaGameMode,
    MediaItem,
    MediaPlatform,
    Movie,
    Season,
    Show,
    Track,
)
from otix.domain.watch_provider import MediaWatchProvider
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
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    async def increment_view_count(media_id: str) -> None:
        """Fire-and-forget view count increment using a fresh session."""
        from otix.infrastructure.database import async_session
        from sqlalchemy import update

        try:
            async with async_session() as session:
                await session.execute(
                    update(MediaItem).where(MediaItem.id == media_id).values(
                        view_count=MediaItem.view_count + 1
                    )
                )
                await session.commit()
        except Exception:
            pass

    async def list_deleted_tmdb_ids(
        self, page: int = 1, page_size: int = 50, media_type: str | None = None,
    ) -> tuple[list, int]:
        """List deleted TMDB IDs with pagination. Returns (items, total)."""
        from otix.domain.media import TMDBDeletedID

        base_query = select(TMDBDeletedID)
        count_query = select(func.count(TMDBDeletedID.id))

        if media_type:
            base_query = base_query.where(TMDBDeletedID.media_type == media_type)
            count_query = count_query.where(TMDBDeletedID.media_type == media_type)

        total = await self.session.scalar(count_query) or 0
        rows = await self.session.execute(
            base_query.order_by(TMDBDeletedID.detection_date.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )
        return list(rows.scalars().all()), total

    async def list_genres(self, media_type: str | None = None) -> list[Genre]:
        """List all genres, optionally filtered by media type."""
        from otix.domain.genre import Genre, MediaGenre

        query = select(Genre).order_by(Genre.name)
        if media_type:
            query = (
                select(Genre)
                .distinct()
                .join(MediaGenre, MediaGenre.genre_id == Genre.id)
                .join(MediaItem, MediaItem.id == MediaGenre.media_item_id)
                .where(MediaItem.media_type == media_type)
                .order_by(Genre.name)
            )
        result = await self.session.scalars(query)
        return list(result)

    async def list_certifications(
        self, country_code: str = "us", media_type: str | None = None
    ) -> list[str]:
        """List distinct certifications for a country, optionally filtered by media type."""
        from otix.domain.asset import MediaRelease

        query = (
            select(MediaRelease.certification)
            .distinct()
            .join(MediaItem, MediaItem.id == MediaRelease.media_item_id)
            .where(
                MediaRelease.country_code == country_code.lower(),
                MediaRelease.certification.isnot(None),
                MediaRelease.certification != "",
            )
            .order_by(MediaRelease.certification)
        )
        if media_type:
            query = query.where(MediaItem.media_type == media_type)
        result = await self.session.scalars(query)
        return list(result)

    async def get_media_item_bare(self, media_id: str) -> MediaItem | None:
        """Return a media item by ID, or None (no eager loads)."""
        return await self.session.get(MediaItem, media_id)

    async def get_media_type(self, media_id: str) -> str | None:
        """Return the media_type for a media item, or None if not found."""
        result = await self.session.scalar(
            select(MediaItem.media_type).where(MediaItem.id == media_id)
        )
        return result

    async def list_media(
        self,
        media_type: str | None = None,
        genre: str | None = None,
        company: str | None = None,
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
        person_id: str | None = None,
        credit_role: str | None = None,
    ) -> tuple[list[MediaItem], bool, int | None]:
        _sort_fields = {
            "popularity": MediaItem.popularity,
            "rating": MediaItem.avg_rating,
            "release_date": MediaItem.release_date,
            "title": MediaItem.title,
            "views": MediaItem.view_count,
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

        # Eager-load album for music queries so callers can access release-group ids
        if media_type == "music":
            query = query.options(selectinload(MediaItem.album))

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
            # Movies/shows need textless poster (TMDB+Fanart provide it).
            # Games use poster_url (IGDB covers don't have a textless variant,
            # and SteamGridDB only covers Steam games).
            # Music uses poster_url (album covers have artwork text).
            query = query.where(
                MediaItem.textless_poster_url.isnot(None)
                | (MediaItem.media_type.in_(["music", "game"]) & MediaItem.poster_url.isnot(None))
            )

        if genre:
            query = query.join(MediaItem.genres).join(MediaGenre.genre).where(Genre.slug == genre)

        if company:
            query = query.join(MediaItem.involved_companies).where(InvolvedCompany.company_id == company)

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
                query = query.where(MediaItem.id.in_(select(Movie.media_item_id).where(movie_cond)))
            elif media_type == "show":
                query = query.where(MediaItem.id.in_(select(Show.media_item_id).where(show_cond)))

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

        if person_id:
            query = query.join(MediaItem.credits).where(
                MediaCredit.person_id == person_id,
                MediaCredit.role == (credit_role or "primary"),
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
            if company:
                count_query = count_query.join(MediaItem.involved_companies).where(
                    InvolvedCompany.company_id == company
                )
            if has_artwork:
                count_query = count_query.where(
                    MediaItem.textless_poster_url.isnot(None)
                    | (MediaItem.media_type.in_(["music", "game"]) & MediaItem.poster_url.isnot(None))
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
                    count_query = count_query.where(MediaItem.id.in_(select(Movie.media_item_id).where(movie_cond)))
                elif media_type == "show":
                    count_query = count_query.where(MediaItem.id.in_(select(Show.media_item_id).where(show_cond)))
            if person_id:
                count_query = count_query.join(MediaItem.credits).where(
                    MediaCredit.person_id == person_id,
                    MediaCredit.role == (credit_role or "primary"),
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
                sub = select(MediaItem).where(MediaItem.id == cursor)
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
                selectinload(MediaItem.watch_providers).joinedload(MediaWatchProvider.watch_provider),
                # Type-specific: use selectinload for collections to avoid cartesian blowup
                joinedload(MediaItem.movie)
                .joinedload(Movie.collection)
                .selectinload(Collection.movies)
                .joinedload(Movie.media_item),
                joinedload(MediaItem.show)
                .selectinload(Show.seasons)
                .selectinload(Season.episodes)
                .selectinload(Episode.external_ratings),
                joinedload(MediaItem.game).selectinload(Game._external_ids),
                joinedload(MediaItem.album).selectinload(Album._external_ids),
                joinedload(MediaItem.album).selectinload(Album.tracks).selectinload(Track._external_ids),
            )
            .where(MediaItem.id == media_id)
        )

        if item is None:
            return None

        # Movie ranking queries — all 3 combined into 1 round-trip via conditional aggregation
        if item.movie is not None:
            movie = item.movie
            needs_revenue = movie.revenue is not None
            needs_profit = movie.budget is not None and movie.budget > 0 and movie.revenue is not None

            if needs_revenue or needs_profit:
                profit_abs = movie.revenue - movie.budget if needs_profit else 0
                profit_expr = Movie.revenue - Movie.budget

                agg_cols = []
                if needs_revenue:
                    agg_cols.append(func.sum(case((Movie.revenue > movie.revenue, 1), else_=0)).label("revenue_rank"))
                if needs_profit:
                    agg_cols.append(
                        func.sum(
                            case(
                                (and_(Movie.budget > 0, Movie.revenue.isnot(None), profit_expr > profit_abs), 1),
                                else_=0,
                            )
                        ).label("profit_rank")
                    )
                    agg_cols.append(
                        func.sum(
                            case(
                                (and_(Movie.budget > 0, Movie.revenue.isnot(None), profit_expr < profit_abs), 1),
                                else_=0,
                            )
                        ).label("loss_rank")
                    )

                ranks = await self.session.execute(select(*agg_cols).select_from(Movie))
                rank_row = ranks.one()

                if needs_revenue:
                    movie.revenue_rank = rank_row.revenue_rank + 1
                if needs_profit:
                    movie.profit_pct = round(profit_abs / movie.budget * 100, 1)
                    movie.profit_rank = rank_row.profit_rank + 1
                    movie.loss_rank = rank_row.loss_rank + 1

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
            .where(Person.name.op("%")(query_str))
        )

        matched_ids = union(fts_ids, fuzzy_ids, credit_ids).subquery()

        # Whether an item was matched via credit/person (for ranking boost).
        credit_person_match = (
            select(1)
            .select_from(MediaCredit)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(
                MediaCredit.media_item_id == MediaItem.id,
                Person.name.op("%")(query_str),
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
        # no embedding for the item or no query embedding was provided.
        if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
            vector_sim = func.coalesce(
                1 - MediaItem.embedding.cosine_distance(query_embedding),
                0,
            )
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
            order = (relevance * 10 + sim * 5 + credit_boost + vector_sim * 3 + popularity_boost * 0.5).desc()

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

    async def search_tracks(
        self,
        query_str: str,
        limit: int = 20,
    ) -> list[Track]:
        q = (
            select(Track)
            .join(Album, Album.media_item_id == Track.album_id)
            .join(MediaItem, MediaItem.id == Album.media_item_id)
            .where(Track.title.ilike(f"%{query_str}%"))
            .order_by(Track.avg_rating.desc().nullslast())
            .limit(limit)
            .options(
                selectinload(Track.album)
                .selectinload(Album.media_item)
                .selectinload(MediaItem.credits)
                .selectinload(MediaCredit.person),
            )
        )
        result = await self.session.scalars(q)
        return list(result)

    async def similar_media(
        self,
        media_id: str,
        media_type: str | None = None,
        limit: int = 20,
        exclude_adult: bool = False,
    ) -> list[MediaItem]:
        """Find semantically similar items via embedding cosine distance.

        Two-phase: KNN fetch (50 candidates via HNSW index), then re-rank with
        a blended score that considers similarity, popularity, artwork, and
        community ratings.

        Falls back to empty list when the source item has no embedding.
        """
        import math

        # Fetch the source embedding
        src = await self.session.scalar(select(MediaItem.embedding).where(MediaItem.id == media_id))
        if src is None:
            return []

        # Phase 1: KNN via HNSW index — fetch top candidates by cosine distance
        dist_label = MediaItem.embedding.cosine_distance(src).label("distance")
        q = (
            select(MediaItem, dist_label)
            .where(MediaItem.id != media_id)
            .where(MediaItem.embedding.isnot(None))
            .order_by(dist_label)
            .limit(50)
        )
        if media_type:
            q = q.where(MediaItem.media_type == media_type)
        if exclude_adult:
            q = q.where(MediaItem.is_adult == False)

        result = await self.session.execute(q)
        rows = result.all()

        # Phase 2: Re-rank with blended quality score
        def _score(item: MediaItem, distance: float) -> float:
            similarity = 1.0 - distance  # 1 = identical, -1 = opposite
            popularity = math.log(max(item.popularity, 1) + 1)
            has_poster = 1.0 if item.poster_url else 0.0
            has_rating = 1.0 if item.avg_rating is not None else 0.0
            return similarity * 5 + popularity * 0.3 + has_poster * 2 + has_rating * 0.5

        scored = [(item, _score(item, dist)) for item, dist in rows]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [item for item, _ in scored[:limit]]

    async def get_media_items_by_ids(self, ids: list[str]) -> list[MediaItem]:
        if not ids:
            return []
        result = await self.session.scalars(select(MediaItem).where(MediaItem.id.in_(ids)))
        items = list(result)
        id_order = {id_: idx for idx, id_ in enumerate(ids)}
        items.sort(key=lambda item: id_order.get(item.id, 999))
        return items

    async def match_local_games(
        self,
        games: list[dict],
        threshold: float = 0.3,
    ) -> list[tuple[str, MediaItem | None, float]]:
        """Match local games to Otix catalog entries.

        Each entry is a dict with ``title`` (required), ``platform`` (optional),
        and ``steam_app_id`` (optional).

        Games with a Steam App ID are matched via direct ``ExternalID`` lookup
        (confidence 1.0). Remaining entries fall through to PostgreSQL trigram
        similarity matching against ``MediaItem.title``.

        Results are returned in the original input order.
        """
        import re

        if not games:
            return []

        n = len(games)
        # Pre-allocate results array so we can fill slots in input order
        results: list[tuple[str, MediaItem | None, float] | None] = [None] * n

        # ── Phase 1: Steam App ID direct lookups ──────────────────────
        from otix.services.external_id_service import ExternalIDService

        steam_indices: list[int] = []
        steam_app_ids: list[str] = []
        for i, g in enumerate(games):
            aid = g.get("steam_app_id")
            if aid is not None:
                steam_indices.append(i)
                steam_app_ids.append(str(aid))

        steam_hits: dict[str, str] = {}  # steam_app_id_str -> entity_id
        if steam_app_ids:
            eid_svc = ExternalIDService(self.session)
            steam_hits = await eid_svc.batch_find_entity_ids("steam", steam_app_ids)

        # Fetch MediaItems for found Steam games in one batch
        steam_items_map: dict[str, MediaItem] = {}
        if steam_hits:
            entity_ids = list(steam_hits.values())
            steam_result = await self.session.execute(
                select(MediaItem).where(MediaItem.id.in_(entity_ids))
            )
            steam_items_map = {item.id: item for item in steam_result.scalars().all()}

        # Fill in Steam results and track which titles still need trigram
        trigram_titles: list[str] = []
        trigram_index_map: list[int] = []  # maps trigram position -> original index
        for i in steam_indices:
            g = games[i]
            aid_str = str(g["steam_app_id"])
            entity_id = steam_hits.get(aid_str)
            if entity_id and entity_id in steam_items_map:
                results[i] = (g["title"], steam_items_map[entity_id], 1.0)
            else:
                # Steam App ID not in catalog yet — fall back to trigram
                trigram_titles.append(g["title"])
                trigram_index_map.append(i)

        # Collect non-Steam entries for trigram matching
        for i, g in enumerate(games):
            if g.get("steam_app_id") is None:
                trigram_titles.append(g["title"])
                trigram_index_map.append(i)

        # ── Phase 2: Trigram matching for remaining titles ──────────
        if trigram_titles:
            trigram_results = await self._match_local_games_by_trigram(
                trigram_titles, threshold
            )
            for pos, (raw_title, item, conf) in enumerate(trigram_results):
                orig_idx = trigram_index_map[pos]
                results[orig_idx] = (raw_title, item, conf)

        # Fill any remaining None slots (should not happen, but be safe)
        for i in range(n):
            if results[i] is None:
                results[i] = (games[i]["title"], None, 0.0)

        return results  # type: ignore[return-value]

    async def _match_local_games_by_trigram(
        self,
        titles: list[str],
        threshold: float = 0.3,
    ) -> list[tuple[str, MediaItem | None, float]]:
        """Fuzzy-match game titles via PostgreSQL trigram similarity.

        Each title is normalized (version strings, group tags, dots/underscores
        stripped) before matching. All titles are matched in a single batched
        SQL query using ``unnest()``.
        """
        import re

        if not titles:
            return []

        # ── Normalize all titles up front ────────────────────────────────
        clean_to_raw: dict[str, str] = {}
        clean_list: list[str] = []
        for raw in titles:
            clean = raw
            clean = re.sub(
                r"[-.\s](?:RUNE|CODEX|FLT|PLAZA|HOODLUM|SKIDROW|TENOKE|DODI|"
                r"ElAmigos|Razor1911|FAIRLIGHT|GOLDBERG|P2P|EMPRESS|FCKDRM|"
                r"STEAMPUNKS|CPY|RELOADED|PROPHET|TiNYiSO|BAT|ALI213|3DM|GOG|FCK)",
                "", clean, flags=re.IGNORECASE,
            )
            clean = re.sub(r"[\[\(]?\s*v?\d+(?:\.\d+)+(?:\w\d*)?\s*[\]\)]?", "", clean)
            clean = re.sub(
                r"(?:\b(?:goty|game of the year|definitive|enhanced|remastered|"
                r"ultimate|complete|deluxe|collectors|special|legendary|"
                r"anniversary|vr|directors? cut)\s*edition\b)",
                "", clean, flags=re.IGNORECASE,
            )
            clean = re.sub(
                r"\b(?:goty|remastered|definitive|enhanced|complete|deluxe|"
                r"legendary|anniversary|repack|multilingual)\b",
                "", clean, flags=re.IGNORECASE,
            )
            clean = clean.replace(".", " ").replace("_", " ")
            clean = re.sub(r"\s+", " ", clean).strip()
            if not clean or clean in clean_to_raw:
                continue
            clean_to_raw[clean] = raw
            clean_list.append(clean)

        if not clean_list:
            return [(t, None, 0.0) for t in titles]

        # ── Single batched SQL query using unnest + DISTINCT ON ──────────
        from sqlalchemy import text

        sql = text(f"""
            SELECT DISTINCT ON (input.clean_title)
                input.clean_title,
                mi.{MediaItem.id.key},
                mi.{MediaItem.title.key},
                similarity(mi.{MediaItem.title.key}, input.clean_title) AS sim
            FROM unnest(CAST(:titles AS text[])) AS input(clean_title)
            JOIN media_items mi ON mi.media_type = 'game'
                AND mi.{MediaItem.title.key} % input.clean_title
            ORDER BY input.clean_title, sim DESC
        """)

        rows = (await self.session.execute(sql, {"titles": clean_list})).all()

        # Build lookup: clean_title -> (media_id, score)
        match_by_clean: dict[str, tuple[str, float]] = {}
        for clean_title, media_id, media_title, sim in rows:
            if clean_title not in match_by_clean or sim > match_by_clean[clean_title][1]:
                match_by_clean[clean_title] = (media_id, round(sim, 4))

        # Fetch actual MediaItem ORM objects for matched items
        matched_ids = {v[0] for v in match_by_clean.values()}
        items_map: dict[str, MediaItem] = {}
        if matched_ids:
            result = await self.session.execute(
                select(MediaItem).where(MediaItem.id.in_(list(matched_ids)))
            )
            items_map = {item.id: item for item in result.scalars().all()}

        # Build result list in original input order
        results: list[tuple[str, MediaItem | None, float]] = []
        for clean in clean_list:
            raw = clean_to_raw[clean]
            if clean in match_by_clean:
                media_id, score = match_by_clean[clean]
                if score >= threshold and media_id in items_map:
                    results.append((raw, items_map[media_id], score))
                else:
                    results.append((raw, None, score))
            else:
                results.append((raw, None, 0.0))

        return results
