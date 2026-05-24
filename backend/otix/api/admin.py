from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_admin_user, get_db
from otix.api.schemas.admin import (
    AdminMetricPoint,
    AdminMetricsResponse,
    AdminRecentUser,
    AdminStatsResponse,
    EnrichmentCounts,
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

    # ── Enrichment counts per media type ──
    enrichment: dict[str, EnrichmentCounts] = {}

    _ENRICH_SQL = {
        "fanart": "SELECT COUNT(DISTINCT ma.media_item_id) FROM media_assets ma JOIN media_items mi ON mi.id = ma.media_item_id WHERE ma.provider = 'fanart' AND mi.media_type = :mt",
        "omdb": "SELECT COUNT(DISTINCT er.media_item_id) FROM external_ratings er JOIN media_items mi ON mi.id = er.media_item_id WHERE er.provider = 'imdb' AND mi.media_type = :mt",
        "embedding": "SELECT COUNT(*) FROM media_items WHERE media_type = :mt AND embedding IS NOT NULL",
        "external_ids": "SELECT COUNT(DISTINCT ei.media_item_id) FROM external_ids ei JOIN media_items mi ON mi.id = ei.media_item_id WHERE ei.provider = :provider AND mi.media_type = :mt",
        "media_assets": "SELECT COUNT(DISTINCT ma.media_item_id) FROM media_assets ma JOIN media_items mi ON mi.id = ma.media_item_id WHERE ma.provider = :provider AND mi.media_type = :mt",
        "external_ratings": "SELECT COUNT(DISTINCT er.media_item_id) FROM external_ratings er JOIN media_items mi ON mi.id = er.media_item_id WHERE er.provider = :provider AND mi.media_type = :mt",
    }

    try:
        _has_embedding = await db.scalar(
            text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='media_items' AND column_name='embedding')")
        )
    except Exception:
        _has_embedding = False

    for mt in ("movie", "show", "music", "game"):
        ec = EnrichmentCounts(total=media_counts.get(mt, 0))
        params = {"mt": mt}

        try:
            if _has_embedding:
                ec.embedding = await db.scalar(text(_ENRICH_SQL["embedding"]), params) or 0
        except Exception:
            pass

        try:
            ec.fanart = await db.scalar(text(_ENRICH_SQL["fanart"]), params) or 0
        except Exception:
            pass

        if mt in ("movie", "show"):
            try:
                ec.omdb = await db.scalar(text(_ENRICH_SQL["omdb"]), params) or 0
            except Exception:
                pass
        elif mt == "game":
            _game_providers = [
                ("igdb", "external_ids"),
                ("steam", "media_assets"),
                ("steamgrid", "media_assets"),
            ]
            for provider, sql_key in _game_providers:
                try:
                    val = await db.scalar(text(_ENRICH_SQL[sql_key]), {**params, "provider": provider}) or 0
                    setattr(ec, provider, val)
                except Exception:
                    pass
        elif mt == "music":
            _music_providers = [
                ("musicbrainz", "external_ids"),
                ("lastfm", "external_ratings"),
                ("spotify", "external_ids"),
            ]
            for provider, sql_key in _music_providers:
                try:
                    val = await db.scalar(text(_ENRICH_SQL[sql_key]), {**params, "provider": provider}) or 0
                    setattr(ec, provider, val)
                except Exception:
                    pass

        enrichment[mt] = ec

    # ── People enrichment ──
    pe = EnrichmentCounts(total=people_count or 0)
    try:
        pe.fanart = await db.scalar(
            select(func.count(PersonAsset.id)).where(PersonAsset.provider == "fanart")
        ) or 0
    except Exception:
        pass
    try:
        pe.spotify = await db.scalar(
            select(func.count(Person.id)).where(Person.spotify_artist_id.isnot(None))
        ) or 0
    except Exception:
        pass
    try:
        pe.musicbrainz = await db.scalar(
            select(func.count(Person.id)).where(Person.musicbrainz_artist_id.isnot(None))
        ) or 0
    except Exception:
        pass
    try:
        pe.imdb = await db.scalar(
            select(func.count(Person.id)).where(Person.imdb_id.isnot(None))
        ) or 0
    except Exception:
        pass
    enrichment["person"] = pe

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
    _admin: User = Depends(get_current_admin_user),
) -> MediaEditProposalList:
    service = AdminEditService(db)
    proposals, total = await service.get_all_proposals(status=status, limit=limit, offset=offset)
    items = []
    for p in proposals:
        out = MediaEditProposalOut.model_validate(p)
        if p.media_item:
            out.media_title = p.media_item.title
            out.media_type = p.media_item.media_type
            out.media_poster_url = p.media_item.poster_url
        items.append(out)
    return MediaEditProposalList(items=items, total=total)
