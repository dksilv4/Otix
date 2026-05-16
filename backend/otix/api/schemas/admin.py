from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class AdminRecentUser(BaseModel):
    id: str
    username: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminStatsResponse(BaseModel):
    total_users: int
    media_counts: dict[str, int]
    stub_counts: dict[str, int]
    people_count: int
    recent_users: list[AdminRecentUser]


class AdminMetricPoint(BaseModel):
    label: str
    value: int


class AdminMetricsResponse(BaseModel):
    metric: str
    hours: float
    data: list[AdminMetricPoint]


class TMDBDeletedIDItem(BaseModel):
    id: str
    tmdb_id: int
    media_type: str
    media_item_id: str | None
    title: str | None
    detection_date: datetime

    model_config = {"from_attributes": True}


class TMDBDeletedIDListResponse(BaseModel):
    items: list[TMDBDeletedIDItem]
    total: int
    page: int
    page_size: int
