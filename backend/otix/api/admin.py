from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import column, exists as sa_exists, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_admin_user, get_db, get_trusted_or_admin_user
from otix.api.schemas.admin import (
    AdminMetricPoint,
    AdminMetricsResponse,
    AdminRecentUser,
    AdminStatsResponse,
    EnrichmentCounts,
    MediaHydrationItem,
    MediaHydrationResponse,
    TMDBDeletedIDItem,
    TMDBDeletedIDListResponse,
)
from otix.api.schemas.admin_edit import MediaEditProposalList, MediaEditProposalOut
from otix.domain.media import ExternalID, MediaItem, TMDBDeletedID
from otix.domain.people import Person, PersonAsset
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.services.admin_edit_service import AdminEditService

admin_router = APIRouter(prefix="/admin", tags=["admin"])

VALID_MEDIA_TYPES = {"movie", "show", "music", "game", "person"}

ENRICHMENT_REDIS_KEY = "admin:prev_enrichment"


@admin_router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> AdminStatsResponse:
    total_users = await db.scalar(select(func.count(User.id)))

    media_rows = await db.execute(
        select(MediaItem.media_type, func.count(MediaItem.id)).group_by(MediaItem.media_type)
    )
    media_counts = {row[0]: row[1] for row in media_rows}

    stub_total = await db.scalar(
        select(func.count(ExternalID.id)).where(ExternalID.media_item_id.is_(None))
    )
    stub_counts = {"total": stub_total or 0}

    people_count = await db.scalar(select(func.count(Person.id)))

    recent_users_result = await db.execute(
        select(User.id, User.username, User.email, User.created_at)
        .order_by(User.created_at.desc())
        .limit(5)
    )
    recent_users = [
        AdminRecentUser(
            id=row[0],
            username=row[1],
            email=row[2],
            created_at=row[3],
        )
        for row in recent_users_result
    ]

    # ── Enrichment counts — all grouped queries, no per-type loop ──
    enrichment: dict[str, EnrichmentCounts] = {}

    # Init all 5 types with their media_counts total
    for mt in (*VALID_MEDIA_TYPES, "person"):
        enrichment[mt] = EnrichmentCounts(total=media_counts.get(mt, 0) if mt != "person" else (people_count or 0))

    # Embedding counts grouped by media_type (1 query)
    try:
        emb_rows = await db.execute(
            select(MediaItem.media_type, func.count(MediaItem.id))
            .where(MediaItem.embedding.isnot(None))
            .group_by(MediaItem.media_type)
        )
        for mt, cnt in emb_rows:
            if mt in enrichment:
                enrichment[mt].embedding = cnt
    except Exception:
        pass

    # Fanart counts grouped by media_type (1 query)
    try:
        from otix.domain.media import MediaAsset
        fa_rows = await db.execute(
            select(MediaItem.media_type, func.count(func.distinct(MediaAsset.media_item_id)))
            .select_from(MediaAsset)
            .join(MediaItem, MediaItem.id == MediaAsset.media_item_id)
            .where(MediaAsset.provider == "fanart")
            .group_by(MediaItem.media_type)
        )
        for mt, cnt in fa_rows:
            if mt in enrichment:
                enrichment[mt].fanart = cnt
    except Exception:
        pass

    # OMDb counts — movie/show only (1 query)
    try:
        from otix.domain.media import ExternalRating
        omdb_rows = await db.execute(
            select(MediaItem.media_type, func.count(func.distinct(ExternalRating.media_item_id)))
            .select_from(ExternalRating)
            .join(MediaItem, MediaItem.id == ExternalRating.media_item_id)
            .where(ExternalRating.provider == "imdb")
            .where(MediaItem.media_type.in_(["movie", "show"]))
            .group_by(MediaItem.media_type)
        )
        for mt, cnt in omdb_rows:
            if mt in enrichment:
                enrichment[mt].omdb = cnt
    except Exception:
        pass

    # Game providers: igdb (external_ids), steam + steamgrid (media_assets) (1 query via UNION ALL)
    try:
        from otix.domain.media import ExternalID as ExtIDGame, MediaAsset as MAGame
        game_rows = await db.execute(
            select(
                text("media_type"),
                text("provider"),
                text("cnt"),
            ).select_from(
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

    # Music providers: musicbrainz + spotify (external_ids), lastfm (external_ratings) (1 query via UNION ALL)
    try:
        music_rows = await db.execute(
            select(
                text("media_type"),
                text("provider"),
                text("cnt"),
            ).select_from(
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

    # People enrichment — all 4 counts in 1 query
    # Use exists() subqueries on the ExternalID table (descriptors can't be used in SQL)
    spotify_exists = sa_exists().where(
        ExternalID.provider == "spotify",
        ExternalID.entity_type == "person",
        ExternalID.entity_id == Person.id,
    )
    musicbrainz_exists = sa_exists().where(
        ExternalID.provider == "musicbrainz_artist",
        ExternalID.entity_type == "person",
        ExternalID.entity_id == Person.id,
    )
    imdb_exists = sa_exists().where(
        ExternalID.provider == "imdb",
        ExternalID.entity_type == "person",
        ExternalID.entity_id == Person.id,
    )

    try:
        people_row = await db.execute(
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

    # ── Deltas (compare to previous snapshot in Redis) ──
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

        # Store current snapshot for next comparison (expire after 24h)
        current_snapshot = {
            key: ec.model_dump() for key, ec in enrichment.items()
        }
        await redis.set(ENRICHMENT_REDIS_KEY, json.dumps(current_snapshot), ex=86400)
    except Exception:
        # Redis unavailable — return zero deltas
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


def _cumulative(points: list[AdminMetricPoint]) -> list[AdminMetricPoint]:
    """Convert per-bucket counts to running totals."""
    total = 0
    result: list[AdminMetricPoint] = []
    for p in points:
        total += p.value
        result.append(AdminMetricPoint(label=p.label, value=total))
    return result


def _granularity(hours: float) -> tuple[str, str]:
    """Return (trunc_unit, label_format) for a given lookback window."""
    if hours <= 1:
        return ("minute", "YYYY-MM-DD HH24:MI")
    if hours <= 48:
        return ("hour", "YYYY-MM-DD HH24:MI")
    return ("day", "YYYY-MM-DD")


@admin_router.get("/metrics", response_model=AdminMetricsResponse)
async def get_admin_metrics(
    metric: str = Query(..., description="Metric name: 'stubs' or 'media_<type>' (movie, show, music, game)"),
    hours: float = Query(336, ge=0.0167, le=8760, description="Lookback window in hours (1 min = 0.0167, 1y = 8760)"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> AdminMetricsResponse:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    trunc_unit, label_fmt = _granularity(hours)

    if metric == "stubs":
        rows = await db.execute(
            select(
                func.to_char(func.date_trunc(trunc_unit, ExternalID.created_at), label_fmt).label("bucket"),
                func.count(ExternalID.id),
            )
            .where(ExternalID.created_at >= since)
            .group_by(text("bucket"))
            .order_by(text("bucket"))
        )
        points = [AdminMetricPoint(label=str(row[0]), value=row[1]) for row in rows]
        data = _cumulative(points)
    elif metric.startswith("stubs_"):
        stub_type = metric.removeprefix("stubs_")
        if stub_type not in VALID_MEDIA_TYPES:
            return AdminMetricsResponse(metric=metric, hours=hours, data=[])
        rows = await db.execute(
            select(
                func.to_char(func.date_trunc(trunc_unit, ExternalID.created_at), label_fmt).label("bucket"),
                func.count(ExternalID.id),
            )
            .where(
                ExternalID.created_at >= since,
                ExternalID.media_item_id.is_(None),
                ExternalID.media_type == stub_type,
            )
            .group_by(text("bucket"))
            .order_by(text("bucket"))
        )
        points = [AdminMetricPoint(label=str(row[0]), value=row[1]) for row in rows]
        data = _cumulative(points)
    elif metric.startswith("media_"):
        media_type = metric.removeprefix("media_")
        if media_type not in VALID_MEDIA_TYPES:
            return AdminMetricsResponse(metric=metric, hours=hours, data=[])
        if media_type == "person":
            rows = await db.execute(
                select(
                    func.to_char(func.date_trunc(trunc_unit, Person.synced_at), label_fmt).label("bucket"),
                    func.count(Person.id),
                )
                .where(Person.synced_at >= since)
                .group_by(text("bucket"))
                .order_by(text("bucket"))
            )
        else:
            rows = await db.execute(
                select(
                    func.to_char(func.date_trunc(trunc_unit, MediaItem.created_at), label_fmt).label("bucket"),
                    func.count(MediaItem.id),
                )
                .where(MediaItem.created_at >= since, MediaItem.media_type == media_type)
                .group_by(text("bucket"))
                .order_by(text("bucket"))
            )
        data = [AdminMetricPoint(label=str(row[0]), value=row[1]) for row in rows]
    else:
        return AdminMetricsResponse(metric=metric, hours=hours, data=[])

    return AdminMetricsResponse(metric=metric, hours=hours, data=data)


@admin_router.get("/deleted-tmdb-ids", response_model=TMDBDeletedIDListResponse)
async def get_deleted_tmdb_ids(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    media_type: str | None = Query(None, description="Filter by media type"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> TMDBDeletedIDListResponse:
    base_query = select(TMDBDeletedID)
    count_query = select(func.count(TMDBDeletedID.id))

    if media_type:
        base_query = base_query.where(TMDBDeletedID.media_type == media_type)
        count_query = count_query.where(TMDBDeletedID.media_type == media_type)

    total = await db.scalar(count_query) or 0

    rows = await db.execute(
        base_query.order_by(TMDBDeletedID.detection_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        TMDBDeletedIDItem.model_validate(row)
        for row in rows.scalars().all()
    ]

    return TMDBDeletedIDListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@admin_router.get("/edit-proposals", response_model=MediaEditProposalList)
async def get_edit_proposals(
    status: str | None = Query(None, description="Filter by status: pending, approved, or rejected"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_trusted_or_admin_user),
) -> MediaEditProposalList:
    service = AdminEditService(db)
    proposals, total = await service.get_all_proposals(status=status, limit=limit, offset=offset)
    vote_map = await service.get_user_votes_for_proposals(
        current_user.id, [p.id for p in proposals]
    ) if proposals else {}
    items = []
    for p in proposals:
        out = MediaEditProposalOut.model_validate(p)
        out.my_vote = vote_map.get(p.id)
        if p.media_item:
            out.media_title = p.media_item.title
            out.media_type = p.media_item.media_type
            out.media_poster_url = p.media_item.poster_url
        items.append(out)
    return MediaEditProposalList(items=items, total=total)


VALID_HYDRATION_SORTS = {
    "completeness_score",
    "synced_at",
    "title",
    "has_overview",
    "has_poster",
    "has_backdrop",
    "has_logo",
    "has_textless_poster",
    "has_release_date",
    "has_embedding",
    "has_original_language",
    "has_genres",
    "has_credits",
    "has_external_ids",
    "has_external_ratings",
    "has_videos",
    "has_assets",
    "has_releases",
    "has_keywords",
    "has_companies",
    "has_watch_providers",
    "has_runtime",
    "has_collection",
    "has_budget",
    "has_show_status",
    "has_episodes",
    "has_platforms",
    "has_game_modes",
    "has_age_ratings",
}


@admin_router.get("/hydration", response_model=MediaHydrationResponse)
async def get_media_hydration(
    media_type: str | None = Query(None, description="Filter by media type: movie, show, game, music"),
    search: str | None = Query(None, description="Search by title substring"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort_by: str = Query("completeness_score", description="Sort column: completeness_score, synced_at, title"),
    sort_dir: str = Query("asc", description="Sort direction: asc or desc"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> MediaHydrationResponse:
    from sqlalchemy import case as sa_case

    from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
    from otix.domain.company import InvolvedCompany
    from otix.domain.genre import MediaGenre, MediaKeyword
    from otix.domain.media import (
        Game,
        MediaGameMode,
        MediaPlatform,
        Movie,
        Show,
    )
    from otix.domain.people import MediaCredit
    from otix.domain.watch_provider import MediaWatchProvider

    # ── Column expressions ──────────────────────────────────────────

    has_genres_expr = sa_exists().where(MediaGenre.media_item_id == MediaItem.id).label("has_genres")
    has_credits_expr = sa_exists().where(MediaCredit.media_item_id == MediaItem.id).label("has_credits")
    has_external_ids_expr = sa_exists().where(
        ExternalID.entity_type == "media_item",
        ExternalID.entity_id == MediaItem.id,
    ).label("has_external_ids")
    has_external_ratings_expr = sa_exists().where(
        ExternalRating.media_item_id == MediaItem.id
    ).label("has_external_ratings")
    has_videos_expr = sa_exists().where(MediaVideo.media_item_id == MediaItem.id).label("has_videos")
    has_assets_expr = sa_exists().where(MediaAsset.media_item_id == MediaItem.id).label("has_assets")
    has_releases_expr = sa_exists().where(MediaRelease.media_item_id == MediaItem.id).label("has_releases")
    has_keywords_expr = sa_exists().where(MediaKeyword.media_item_id == MediaItem.id).label("has_keywords")
    has_companies_expr = sa_exists().where(
        InvolvedCompany.media_item_id == MediaItem.id
    ).label("has_companies")
    has_watch_providers_expr = sa_exists().where(
        MediaWatchProvider.media_item_id == MediaItem.id
    ).label("has_watch_providers")

    has_runtime_expr = sa_case(
        (MediaItem.media_type == "movie", Movie.runtime.is_not(None)),
        else_=None,
    ).label("has_runtime")
    has_collection_expr = sa_case(
        (MediaItem.media_type == "movie", Movie.collection_id.is_not(None)),
        else_=None,
    ).label("has_collection")
    has_budget_expr = sa_case(
        (MediaItem.media_type == "movie", Movie.budget.is_not(None)),
        else_=None,
    ).label("has_budget")
    has_show_status_expr = sa_case(
        (MediaItem.media_type == "show", Show.status.is_not(None)),
        else_=None,
    ).label("has_show_status")
    has_episodes_expr = sa_case(
        (MediaItem.media_type == "show", Show.number_of_episodes.is_not(None)),
        else_=None,
    ).label("has_episodes")
    has_platforms_expr = sa_case(
        (MediaItem.media_type == "game", sa_exists().where(
            MediaPlatform.media_item_id == MediaItem.id,
        )),
        else_=None,
    ).label("has_platforms")
    has_game_modes_expr = sa_case(
        (MediaItem.media_type == "game", sa_exists().where(
            MediaGameMode.media_item_id == MediaItem.id,
        )),
        else_=None,
    ).label("has_game_modes")
    has_age_ratings_expr = sa_case(
        (MediaItem.media_type == "game", sa_exists().where(
            MediaRelease.media_item_id == MediaItem.id,
            MediaRelease.certification.is_not(None),
        )),
        else_=None,
    ).label("has_age_ratings")

    # ── Base query ──────────────────────────────────────────────────

    cols = [
        MediaItem.id,
        MediaItem.title,
        MediaItem.media_type,
        MediaItem.slug,
        MediaItem.overview.is_not(None).label("has_overview"),
        MediaItem.poster_url.is_not(None).label("has_poster"),
        MediaItem.backdrop_url.is_not(None).label("has_backdrop"),
        MediaItem.logo_url.is_not(None).label("has_logo"),
        MediaItem.textless_poster_url.is_not(None).label("has_textless_poster"),
        MediaItem.release_date.is_not(None).label("has_release_date"),
        MediaItem.embedding.is_not(None).label("has_embedding"),
        MediaItem.original_language.is_not(None).label("has_original_language"),
        has_genres_expr,
        has_credits_expr,
        has_external_ids_expr,
        has_external_ratings_expr,
        has_videos_expr,
        has_assets_expr,
        has_releases_expr,
        has_keywords_expr,
        has_companies_expr,
        has_watch_providers_expr,
        has_runtime_expr,
        has_collection_expr,
        has_budget_expr,
        has_show_status_expr,
        has_episodes_expr,
        has_platforms_expr,
        has_game_modes_expr,
        has_age_ratings_expr,
        MediaItem.completeness_score,
        MediaItem.synced_at,
        MediaItem.next_sync_at,
    ]

    base = select(*cols).outerjoin(Movie, Movie.media_item_id == MediaItem.id).outerjoin(
        Show, Show.media_item_id == MediaItem.id
    ).outerjoin(Game, Game.media_item_id == MediaItem.id)

    # ── Filters ─────────────────────────────────────────────────────

    if media_type:
        base = base.where(MediaItem.media_type == media_type)
    if search:
        base = base.where(MediaItem.title.ilike(f"%{search}%"))

    count_base = select(func.count(MediaItem.id))
    if media_type:
        count_base = count_base.where(MediaItem.media_type == media_type)
    if search:
        count_base = count_base.where(MediaItem.title.ilike(f"%{search}%"))

    total = await db.scalar(count_base) or 0

    # ── Sort & paginate ─────────────────────────────────────────────

    if sort_by not in VALID_HYDRATION_SORTS:
        sort_by = "completeness_score"

    if sort_by in ("completeness_score", "synced_at", "title"):
        sort_col = getattr(MediaItem, sort_by)
    else:
        sort_col = column(sort_by)

    if sort_dir == "desc":
        base = base.order_by(sort_col.desc())
    else:
        base = base.order_by(sort_col.asc())

    base = base.offset((page - 1) * per_page).limit(per_page)

    # ── Execute & map ───────────────────────────────────────────────

    rows = await db.execute(base)
    items: list[MediaHydrationItem] = []
    for row in rows:
        core_flags = (
            row.has_overview, row.has_poster, row.has_backdrop, row.has_logo,
            row.has_textless_poster, row.has_release_date, row.has_embedding,
            row.has_original_language,
        )
        relation_flags = (
            row.has_genres, row.has_credits, row.has_external_ids,
            row.has_external_ratings, row.has_videos, row.has_assets,
            row.has_releases, row.has_keywords, row.has_companies,
            row.has_watch_providers,
        )

        media_type = row.media_type
        if media_type == "movie":
            type_flags = (row.has_runtime, row.has_collection, row.has_budget)
            type_denom = 3
        elif media_type == "show":
            type_flags = (row.has_show_status, row.has_episodes)
            type_denom = 2
        elif media_type == "game":
            type_flags = (row.has_platforms, row.has_game_modes, row.has_age_ratings)
            type_denom = 3
        else:
            type_flags = ()
            type_denom = 0

        all_flags = core_flags + relation_flags + type_flags
        denominator = 8 + 10 + type_denom
        score = sum(1 for f in all_flags if f) / denominator if denominator > 0 else 0.0

        items.append(MediaHydrationItem(
            id=row.id,
            title=row.title,
            media_type=row.media_type,
            slug=row.slug,
            has_overview=row.has_overview,
            has_poster=row.has_poster,
            has_backdrop=row.has_backdrop,
            has_logo=row.has_logo,
            has_textless_poster=row.has_textless_poster,
            has_release_date=row.has_release_date,
            has_embedding=row.has_embedding,
            has_original_language=row.has_original_language,
            has_genres=row.has_genres,
            has_credits=row.has_credits,
            has_external_ids=row.has_external_ids,
            has_external_ratings=row.has_external_ratings,
            has_videos=row.has_videos,
            has_assets=row.has_assets,
            has_releases=row.has_releases,
            has_keywords=row.has_keywords,
            has_companies=row.has_companies,
            has_watch_providers=row.has_watch_providers,
            has_runtime=row.has_runtime,
            has_collection=row.has_collection,
            has_budget=row.has_budget,
            has_show_status=row.has_show_status,
            has_episodes=row.has_episodes,
            has_platforms=row.has_platforms,
            has_game_modes=row.has_game_modes,
            has_age_ratings=row.has_age_ratings,
            completeness_score=round(score, 3),
            synced_at=row.synced_at,
            next_sync_at=row.next_sync_at,
        ))

    return MediaHydrationResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )
