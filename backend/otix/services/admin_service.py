"""Admin dashboard service — encapsulates all admin-specific aggregation queries."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import case as sa_case
from sqlalchemy import column, func, select, text
from sqlalchemy import exists as sa_exists
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, MediaItem
from otix.domain.people import Person
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.schemas.admin import (
    AdminMetricPoint,
    AdminRecentUser,
    AdminStatsResponse,
    EnrichmentCounts,
    MediaHydrationItem,
    MediaHydrationResponse,
    TMDBDeletedIDItem,
    TMDBDeletedIDListResponse,
)

logger = structlog.get_logger()

VALID_MEDIA_TYPES = {"movie", "show", "music", "game", "person"}
VALID_HYDRATION_SORTS = {
    "completeness_score", "synced_at", "title",
    "has_overview", "has_poster", "has_backdrop", "has_logo",
    "has_textless_poster", "has_release_date", "has_embedding",
    "has_original_language", "has_genres", "has_credits",
    "has_external_ids", "has_external_ratings", "has_videos",
    "has_assets", "has_releases", "has_keywords", "has_companies",
    "has_watch_providers", "has_runtime", "has_collection",
    "has_budget", "has_show_status", "has_episodes", "has_platforms",
    "has_game_modes", "has_age_ratings",
}
ENRICHMENT_REDIS_KEY = "admin:prev_enrichment"


class AdminService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_deleted_tmdb_ids(
        self, page: int = 1, page_size: int = 50, media_type: str | None = None,
    ) -> TMDBDeletedIDListResponse:
        """List deleted TMDB IDs with pagination."""
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
        items = [TMDBDeletedIDItem.model_validate(row) for row in rows.scalars().all()]
        return TMDBDeletedIDListResponse(items=items, total=total, page=page, page_size=page_size)

    async def get_hydration_status(
        self,
        media_type: str | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 50,
        sort_by: str = "completeness_score",
        sort_dir: str = "asc",
    ) -> MediaHydrationResponse:
        """Get media hydration status for the admin panel."""
        from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
        from otix.domain.company import InvolvedCompany
        from otix.domain.genre import MediaGenre, MediaKeyword
        from otix.domain.media import Game, MediaGameMode, MediaPlatform, Movie, Show
        from otix.domain.people import MediaCredit
        from otix.domain.watch_provider import MediaWatchProvider

        has_genres_expr = sa_exists().where(MediaGenre.media_item_id == MediaItem.id).label("has_genres")
        has_credits_expr = sa_exists().where(MediaCredit.media_item_id == MediaItem.id).label("has_credits")
        has_external_ids_expr = sa_exists().where(
            ExternalID.entity_type == "media_item", ExternalID.entity_id == MediaItem.id,
        ).label("has_external_ids")
        has_external_ratings_expr = sa_exists().where(ExternalRating.media_item_id == MediaItem.id).label("has_external_ratings")
        has_videos_expr = sa_exists().where(MediaVideo.media_item_id == MediaItem.id).label("has_videos")
        has_assets_expr = sa_exists().where(MediaAsset.media_item_id == MediaItem.id).label("has_assets")
        has_releases_expr = sa_exists().where(MediaRelease.media_item_id == MediaItem.id).label("has_releases")
        has_keywords_expr = sa_exists().where(MediaKeyword.media_item_id == MediaItem.id).label("has_keywords")
        has_companies_expr = sa_exists().where(InvolvedCompany.media_item_id == MediaItem.id).label("has_companies")
        has_watch_providers_expr = sa_exists().where(MediaWatchProvider.media_item_id == MediaItem.id).label("has_watch_providers")
        has_runtime_expr = sa_case((MediaItem.media_type == "movie", Movie.runtime.is_not(None)), else_=None).label("has_runtime")
        has_collection_expr = sa_case((MediaItem.media_type == "movie", Movie.collection_id.is_not(None)), else_=None).label("has_collection")
        has_budget_expr = sa_case((MediaItem.media_type == "movie", Movie.budget.is_not(None)), else_=None).label("has_budget")
        has_show_status_expr = sa_case((MediaItem.media_type == "show", Show.status.is_not(None)), else_=None).label("has_show_status")
        has_episodes_expr = sa_case((MediaItem.media_type == "show", Show.number_of_episodes.is_not(None)), else_=None).label("has_episodes")
        has_platforms_expr = sa_case(
            (MediaItem.media_type == "game", sa_exists().where(MediaPlatform.media_item_id == MediaItem.id)), else_=None,
        ).label("has_platforms")
        has_game_modes_expr = sa_case(
            (MediaItem.media_type == "game", sa_exists().where(MediaGameMode.media_item_id == MediaItem.id)), else_=None,
        ).label("has_game_modes")
        has_age_ratings_expr = sa_case(
            (MediaItem.media_type == "game", sa_exists().where(
                MediaRelease.media_item_id == MediaItem.id, MediaRelease.certification.is_not(None),
            )), else_=None,
        ).label("has_age_ratings")

        cols = [
            MediaItem.id, MediaItem.title, MediaItem.media_type, MediaItem.slug,
            MediaItem.overview.is_not(None).label("has_overview"),
            MediaItem.poster_url.is_not(None).label("has_poster"),
            MediaItem.backdrop_url.is_not(None).label("has_backdrop"),
            MediaItem.logo_url.is_not(None).label("has_logo"),
            MediaItem.textless_poster_url.is_not(None).label("has_textless_poster"),
            MediaItem.release_date.is_not(None).label("has_release_date"),
            MediaItem.embedding.is_not(None).label("has_embedding"),
            MediaItem.original_language.is_not(None).label("has_original_language"),
            has_genres_expr, has_credits_expr, has_external_ids_expr,
            has_external_ratings_expr, has_videos_expr, has_assets_expr, has_releases_expr,
            has_keywords_expr, has_companies_expr, has_watch_providers_expr,
            has_runtime_expr, has_collection_expr, has_budget_expr,
            has_show_status_expr, has_episodes_expr, has_platforms_expr,
            has_game_modes_expr, has_age_ratings_expr,
            MediaItem.completeness_score, MediaItem.synced_at, MediaItem.next_sync_at,
        ]

        base = select(*cols).outerjoin(Movie, Movie.media_item_id == MediaItem.id).outerjoin(
            Show, Show.media_item_id == MediaItem.id
        ).outerjoin(Game, Game.media_item_id == MediaItem.id)

        if media_type:
            base = base.where(MediaItem.media_type == media_type)
        if search:
            base = base.where(MediaItem.title.ilike(f"%{search}%"))

        count_base = select(func.count(MediaItem.id))
        if media_type:
            count_base = count_base.where(MediaItem.media_type == media_type)
        if search:
            count_base = count_base.where(MediaItem.title.ilike(f"%{search}%"))

        total = await self.session.scalar(count_base) or 0

        if sort_by not in VALID_HYDRATION_SORTS:
            sort_by = "completeness_score"
        sort_col = getattr(MediaItem, sort_by, None) or column(sort_by)
        base = base.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
        base = base.offset((page - 1) * per_page).limit(per_page)

        rows = await self.session.execute(base)
        items: list[MediaHydrationItem] = []
        for row in rows:
            core_flags = (row.has_overview, row.has_poster, row.has_backdrop, row.has_logo,
                           row.has_textless_poster, row.has_release_date, row.has_embedding, row.has_original_language)
            relation_flags = (row.has_genres, row.has_credits, row.has_external_ids, row.has_external_ratings,
                              row.has_videos, row.has_assets, row.has_releases, row.has_keywords,
                              row.has_companies, row.has_watch_providers)
            mt = row.media_type
            if mt == "movie":
                type_flags, type_denom = (row.has_runtime, row.has_collection, row.has_budget), 3
            elif mt == "show":
                type_flags, type_denom = (row.has_show_status, row.has_episodes), 2
            elif mt == "game":
                type_flags, type_denom = (row.has_platforms, row.has_game_modes, row.has_age_ratings), 3
            else:
                type_flags, type_denom = (), 0
            denominator = 8 + 10 + type_denom
            score = sum(1 for f in core_flags + relation_flags + type_flags if f) / denominator if denominator > 0 else 0.0

            items.append(MediaHydrationItem(
                id=row.id, title=row.title, media_type=row.media_type, slug=row.slug,
                **{flag: getattr(row, flag) for flag in [
                    "has_overview", "has_poster", "has_backdrop", "has_logo",
                    "has_textless_poster", "has_release_date", "has_embedding",
                    "has_original_language", "has_genres", "has_credits",
                    "has_external_ids", "has_external_ratings", "has_videos",
                    "has_assets", "has_releases", "has_keywords", "has_companies",
                    "has_watch_providers", "has_runtime", "has_collection",
                    "has_budget", "has_show_status", "has_episodes", "has_platforms",
                    "has_game_modes", "has_age_ratings",
                ]},
                completeness_score=round(score, 3),
                synced_at=row.synced_at, next_sync_at=row.next_sync_at,
            ))

        return MediaHydrationResponse(items=items, total=total, page=page, per_page=per_page)

    async def get_metrics(
        self, metric: str, hours: float,
    ) -> list[AdminMetricPoint]:
        """Get admin metrics time-series data."""
        since = datetime.now(UTC) - timedelta(hours=hours)
        trunc_unit, label_fmt = self._granularity(hours)

        if metric == "stubs":
            rows = await self.session.execute(
                select(
                    func.to_char(func.date_trunc(trunc_unit, ExternalID.created_at), label_fmt).label("bucket"),
                    func.count(ExternalID.id),
                ).where(ExternalID.created_at >= since).group_by(text("bucket")).order_by(text("bucket"))
            )
            return self._cumulative([AdminMetricPoint(label=str(row[0]), value=row[1]) for row in rows])
        elif metric.startswith("stubs_"):
            stub_type = metric.removeprefix("stubs_")
            if stub_type not in VALID_MEDIA_TYPES:
                return []
            rows = await self.session.execute(
                select(
                    func.to_char(func.date_trunc(trunc_unit, ExternalID.created_at), label_fmt).label("bucket"),
                    func.count(ExternalID.id),
                ).where(ExternalID.created_at >= since, ExternalID.media_item_id.is_(None),
                        ExternalID.media_type == stub_type).group_by(text("bucket")).order_by(text("bucket"))
            )
            return self._cumulative([AdminMetricPoint(label=str(row[0]), value=row[1]) for row in rows])
        elif metric.startswith("media_"):
            media_type = metric.removeprefix("media_")
            if media_type not in VALID_MEDIA_TYPES:
                return []
            if media_type == "person":
                rows = await self.session.execute(
                    select(
                        func.to_char(func.date_trunc(trunc_unit, Person.synced_at), label_fmt).label("bucket"),
                        func.count(Person.id),
                    ).where(Person.synced_at >= since).group_by(text("bucket")).order_by(text("bucket"))
                )
            else:
                rows = await self.session.execute(
                    select(
                        func.to_char(func.date_trunc(trunc_unit, MediaItem.created_at), label_fmt).label("bucket"),
                        func.count(MediaItem.id),
                    ).where(MediaItem.created_at >= since, MediaItem.media_type == media_type)
                    .group_by(text("bucket")).order_by(text("bucket"))
                )
            return [AdminMetricPoint(label=str(row[0]), value=row[1]) for row in rows]

        return []

    async def get_stats(self) -> AdminStatsResponse:
        """Get admin dashboard statistics."""
        total_users = await self.session.scalar(select(func.count(User.id)))
        media_rows = await self.session.execute(
            select(MediaItem.media_type, func.count(MediaItem.id)).group_by(MediaItem.media_type)
        )
        media_counts = {row[0]: row[1] for row in media_rows}

        stub_total = await self.session.scalar(
            select(func.count(ExternalID.id)).where(ExternalID.media_item_id.is_(None))
        )
        stub_counts = {"total": stub_total or 0}

        people_count = await self.session.scalar(select(func.count(Person.id)))

        recent_users_result = await self.session.execute(
            select(User.id, User.username, User.email, User.created_at)
            .order_by(User.created_at.desc()).limit(5)
        )
        recent_users = [
            AdminRecentUser(id=row[0], username=row[1], email=row[2], created_at=row[3])
            for row in recent_users_result
        ]

        enrichment: dict[str, EnrichmentCounts] = {}
        for mt in (*VALID_MEDIA_TYPES, "person"):
            enrichment[mt] = EnrichmentCounts(
                total=media_counts.get(mt, 0) if mt != "person" else (people_count or 0)
            )

        # Embedding counts
        try:
            emb_rows = await self.session.execute(
                select(MediaItem.media_type, func.count(MediaItem.id))
                .where(MediaItem.embedding.isnot(None))
                .group_by(MediaItem.media_type)
            )
            for mt, cnt in emb_rows:
                if mt in enrichment:
                    enrichment[mt].embedding = cnt
        except Exception:
            pass

        # Fanart counts
        try:
            from otix.domain.asset import MediaAsset
            fa_rows = await self.session.execute(
                select(MediaItem.media_type, func.count(func.distinct(MediaAsset.media_item_id)))
                .select_from(MediaAsset).join(MediaItem, MediaItem.id == MediaAsset.media_item_id)
                .where(MediaAsset.provider == "fanart").group_by(MediaItem.media_type)
            )
            for mt, cnt in fa_rows:
                if mt in enrichment:
                    enrichment[mt].fanart = cnt
        except Exception:
            pass

        # OMDB/IMDB counts
        try:
            from otix.domain.media import ExternalRating
            omdb_rows = await self.session.execute(
                select(MediaItem.media_type, func.count(func.distinct(ExternalRating.media_item_id)))
                .select_from(ExternalRating).join(MediaItem, MediaItem.id == ExternalRating.media_item_id)
                .where(ExternalRating.provider == "imdb")
                .where(MediaItem.media_type.in_(["movie", "show"]))
                .group_by(MediaItem.media_type)
            )
            for mt, cnt in omdb_rows:
                if mt in enrichment:
                    enrichment[mt].omdb = cnt
        except Exception:
            pass

        # Game enrichment
        try:
            game_rows = await self.session.execute(
                select(text("media_type"), text("provider"), text("cnt")).select_from(
                    text("""
                        (SELECT mi.media_type, 'igdb' AS provider, COUNT(DISTINCT ei.media_item_id) AS cnt
                         FROM external_ids ei JOIN media_items mi ON mi.id = ei.media_item_id
                         WHERE ei.provider = 'igdb' AND mi.media_type = 'game'
                         GROUP BY mi.media_type)
                        UNION ALL
                        (SELECT mi.media_type, ma.provider, COUNT(DISTINCT ma.media_item_id) AS cnt
                         FROM media_assets ma JOIN media_items mi ON mi.id = ma.media_item_id
                         WHERE ma.provider IN ('steam', 'steamgrid') AND mi.media_type = 'game'
                         GROUP BY mi.media_type, ma.provider)
                    """)
                )
            )
            for mt, provider, cnt in game_rows:
                if mt in enrichment and hasattr(enrichment[mt], provider):
                    setattr(enrichment[mt], provider, cnt)
        except Exception:
            pass

        # Music enrichment
        try:
            music_rows = await self.session.execute(
                select(text("media_type"), text("provider"), text("cnt")).select_from(
                    text("""
                        (SELECT mi.media_type, ei.provider, COUNT(DISTINCT ei.media_item_id) AS cnt
                         FROM external_ids ei JOIN media_items mi ON mi.id = ei.media_item_id
                         WHERE ei.provider IN ('musicbrainz', 'spotify') AND mi.media_type = 'music'
                         GROUP BY mi.media_type, ei.provider)
                        UNION ALL
                        (SELECT mi.media_type, er.provider, COUNT(DISTINCT er.media_item_id) AS cnt
                         FROM external_ratings er JOIN media_items mi ON mi.id = er.media_item_id
                         WHERE er.provider = 'lastfm' AND mi.media_type = 'music'
                         GROUP BY mi.media_type, er.provider)
                    """)
                )
            )
            for mt, provider, cnt in music_rows:
                if mt in enrichment and hasattr(enrichment[mt], provider):
                    setattr(enrichment[mt], provider, cnt)
        except Exception:
            pass

        # Person enrichment
        spotify_exists = sa_exists().where(
            ExternalID.provider == "spotify", ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        musicbrainz_exists = sa_exists().where(
            ExternalID.provider == "musicbrainz_artist", ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        imdb_exists = sa_exists().where(
            ExternalID.provider == "imdb", ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        try:
            from otix.domain.people import PersonAsset
            people_row = await self.session.execute(
                select(
                    func.count(func.distinct(PersonAsset.id)).filter(PersonAsset.provider == "fanart").label("fanart"),
                    func.count(Person.id).filter(spotify_exists).label("spotify"),
                    func.count(Person.id).filter(musicbrainz_exists).label("musicbrainz"),
                    func.count(Person.id).filter(imdb_exists).label("imdb"),
                ).select_from(Person).outerjoin(PersonAsset, PersonAsset.person_id == Person.id)
            )
            row = people_row.one()
            enrichment["person"].fanart = row.fanart or 0
            enrichment["person"].spotify = row.spotify or 0
            enrichment["person"].musicbrainz = row.musicbrainz or 0
            enrichment["person"].imdb = row.imdb or 0
        except Exception:
            pass

        # Delta computation
        deltas: dict[str, EnrichmentCounts] = {}
        try:
            redis = await get_redis()
            prev_raw = await redis.get(ENRICHMENT_REDIS_KEY)
            prev_data: dict[str, dict[str, int]] = json.loads(prev_raw) if prev_raw else {}
            for key, ec in enrichment.items():
                prev = prev_data.get(key, {})
                deltas[key] = EnrichmentCounts(
                    total=ec.total - prev.get("total", ec.total),
                    fanart=ec.fanart - prev.get("fanart", ec.fanart),
                    omdb=ec.omdb - prev.get("omdb", ec.omdb),
                    igdb=ec.igdb - prev.get("igdb", ec.igdb),
                    steam=ec.steam - prev.get("steam", ec.steam),
                    steamgrid=ec.steamgrid - prev.get("steamgrid", ec.steamgrid),
                    musicbrainz=ec.musicbrainz - prev.get("musicbrainz", ec.musicbrainz),
                    lastfm=ec.lastfm - prev.get("lastfm", ec.lastfm),
                    spotify=ec.spotify - prev.get("spotify", ec.spotify),
                    embedding=ec.embedding - prev.get("embedding", ec.embedding),
                    imdb=ec.imdb - prev.get("imdb", ec.imdb),
                )
            current_snapshot = {key: ec.model_dump() for key, ec in enrichment.items()}
            await redis.set(ENRICHMENT_REDIS_KEY, json.dumps(current_snapshot), ex=86400)
        except Exception:
            for key in enrichment:
                deltas[key] = EnrichmentCounts()

        return AdminStatsResponse(
            total_users=total_users or 0,
            media_counts=media_counts,
            enrichment=enrichment,
            deltas=deltas,
            stub_counts=stub_counts,
            people_count=people_count or 0,
            recent_users=recent_users,
        )

    # ── Helpers ──

    @staticmethod
    def _cumulative(points: list[AdminMetricPoint]) -> list[AdminMetricPoint]:
        total = 0
        result: list[AdminMetricPoint] = []
        for p in points:
            total += p.value
            result.append(AdminMetricPoint(label=p.label, value=total))
        return result

    @staticmethod
    def _granularity(hours: float) -> tuple[str, str]:
        if hours <= 1:
            return ("minute", "YYYY-MM-DD HH24:MI")
        if hours <= 48:
            return ("hour", "YYYY-MM-DD HH24:MI")
        return ("day", "YYYY-MM-DD")
