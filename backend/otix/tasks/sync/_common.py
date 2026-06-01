"""Shared utilities for sync tasks: hash helpers, queue safety, enqueue helpers."""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import redis.asyncio as aioredis
import structlog
from sqlalchemy import func, select

from otix.domain.media import ExternalID, MediaItem
from otix.domain.sync import ProviderState
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.progress import incr as _progress_incr
from otix.lib.types import JSONValue

logger = structlog.get_logger()


# ── Queue backlog safety ──────────────────────────────────────────────────

_broker_redis: aioredis.Redis | None = None


async def check_fast_queue_backlog(queue: str = "ingest-tmdb") -> tuple[int, bool]:
    """Check a queue backlog against the configured threshold.

    Returns (length, throttled) — throttled is True when the queue is over the limit.
    Default queue is 'ingest-tmdb' since that's the highest-traffic catalog queue.
    """
    global _broker_redis
    try:
        if _broker_redis is None:
            broker_url = settings.celery_broker
            parsed = urlparse(broker_url)
            broker_redis_url = f"redis://{parsed.hostname}:{parsed.port}/0"
            _broker_redis = aioredis.from_url(broker_redis_url, decode_responses=True)
        length = await _broker_redis.llen(queue) or 0
    except Exception:
        logger.warning("failed to check queue backlog", exc_info=True, queue=queue)
        return 0, False

    threshold = settings.celery_fast_queue_max_backlog
    throttled = length > threshold
    if throttled:
        logger.info("queue backlog throttle active", queue=queue, queue_length=length, threshold=threshold)
    return length, throttled


# ── Hash helpers ───────────────────────────────────────────────────────


def compute_content_hash(raw: dict) -> str:
    """SHA256 of provider response, excluding volatile fields."""
    stable = {k: v for k, v in raw.items() if k not in ("popularity", "hypes")}
    return hashlib.sha256(
        json.dumps(stable, sort_keys=True, default=str).encode()
    ).hexdigest()


def compute_next_sync_at(entity_type: str, raw: dict, hash_match_count: int = 0) -> datetime:
    """Compute next_sync_at based on entity lifecycle.

    Movies: released ≤90d → 12h, ≤2y → 7d, older → 30d.
    Shows: airing → 6h, ended ≤2y → 7d, older → 30d.
    People: popularity >5 → 7d, else → 30d.

    Escalation: base * 2^hash_match_count, capped at max_escalation_days.
    """
    now = datetime.now(timezone.utc)

    if entity_type == "movie":
        release_str = raw.get("release_date", "")
        if release_str:
            try:
                release_date = datetime.strptime(release_str, "%Y-%m-%d").date()
                age_days = (now.date() - release_date).days
            except (ValueError, TypeError):
                age_days = 9999
        else:
            age_days = 9999

        if age_days <= 90:
            base_hours = 12
        elif age_days <= 730:
            base_hours = 24 * 7
        else:
            base_hours = 24 * 30
    elif entity_type == "show":
        status = raw.get("status", "")
        if status in ("Returning Series", "In Production", "Planned"):
            base_hours = 6
        elif status in ("Ended", "Canceled"):
            last_air_str = raw.get("last_air_date", "")
            if last_air_str:
                try:
                    last_air = datetime.strptime(last_air_str, "%Y-%m-%d").date()
                    age_days = (now.date() - last_air).days
                except (ValueError, TypeError):
                    age_days = 9999
            else:
                age_days = 9999
            if age_days <= 730:
                base_hours = 24 * 7
            else:
                base_hours = 24 * 30
        else:
            base_hours = 24 * 7
    else:  # person
        popularity = raw.get("popularity", 0) or 0
        base_hours = 24 * 7 if popularity > 5 else 24 * 30

    escalation = 2 ** min(hash_match_count, 5)
    max_hours = settings.tmdb_sync_max_escalation_days * 24
    hours = min(base_hours * escalation, max_hours)

    return now + timedelta(hours=hours)


# ── ProviderState helpers ─────────────────────────────────────────────


async def get_last_change_check(provider: str) -> datetime:
    """Get last change check time, or default to 24h ago."""
    async with async_session() as session:
        state = await session.get(ProviderState, provider)
        if state and state.last_sync_at:
            return state.last_sync_at
        return datetime.now(timezone.utc) - timedelta(hours=24)


async def set_last_change_check(provider: str, dt: datetime) -> None:
    """Update the last change check timestamp."""
    async with async_session() as session:
        state = await session.get(ProviderState, provider)
        if state:
            state.last_sync_at = dt
        else:
            session.add(ProviderState(provider=provider, last_sync_at=dt))
        await session.commit()


# ── Enqueue helpers ───────────────────────────────────────────────────


async def filter_stale_ids(provider: str, external_ids: set[str]) -> set[str]:
    """Return IDs where next_sync_at is in the past or unset."""
    if not external_ids:
        return set()
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        result = await session.scalars(
            select(ExternalID.external_id)
            .join(MediaItem)
            .where(
                ExternalID.provider == provider,
                ExternalID.external_id.in_(external_ids),
                MediaItem.next_sync_at > now,
            )
        )
        fresh = {r for r in result}
    return external_ids - fresh


async def enqueue_list_items(provider: str, media_type: str, external_ids: set[str]) -> tuple[int, int]:
    """Enqueue individual sync tasks for stale items. Returns (enqueued, skipped)."""
    from celery import group

    stale_ids = await filter_stale_ids(provider, external_ids)
    if not stale_ids:
        return 0, len(external_ids)

    task_name = f"sync.{provider}.{media_type}"
    sigs = [
        app.signature(task_name, args=[int(ext_id) if ext_id.isdigit() else ext_id])
        for ext_id in stale_ids
    ]
    group(sigs).apply_async()
    enqueued = len(stale_ids)
    return enqueued, len(external_ids) - enqueued


async def filter_missing_ids(provider: str, external_ids: set[str]) -> set[str]:
    """Return IDs that are NOT in the database."""
    if not external_ids:
        return set()
    async with async_session() as session:
        result = await session.scalars(
            select(ExternalID.external_id).where(
                ExternalID.provider == provider,
                ExternalID.external_id.in_(external_ids),
            )
        )
        existing = {r for r in result}
    return external_ids - existing
