from __future__ import annotations

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
    TMDBDeletedIDItem,
    TMDBDeletedIDListResponse,
)
from otix.domain.media import ExternalID, MediaItem, TMDBDeletedID
from otix.domain.people import Person
from otix.domain.user import User

admin_router = APIRouter(prefix="/admin", tags=["admin"])

VALID_MEDIA_TYPES = {"movie", "show", "music", "game", "person"}


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

    return AdminStatsResponse(
        total_users=total_users or 0,
        media_counts=media_counts,
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
