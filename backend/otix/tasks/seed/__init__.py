"""Seed tasks — bulk data import and backlog processing.

Shared utilities used by both catalog_seed.py and tmdb_seed.py.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx
import redis.asyncio as aioredis
import structlog

from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

TMDB_EXPORT_BASE = "https://files.tmdb.org/p/exports"

_export_client: httpx.AsyncClient | None = None
_export_client_loop_id: int | None = None


def _get_export_client() -> httpx.AsyncClient:
    """Return a shared HTTP client with connection pooling for export downloads.

    Recreates the client if the event loop changes (Celery prefork safety).
    """
    global _export_client, _export_client_loop_id
    loop_id = id(asyncio.get_running_loop())
    if _export_client is None or _export_client.is_closed or _export_client_loop_id != loop_id:
        _export_client = httpx.AsyncClient(
            timeout=httpx.Timeout(300, connect=30),
            limits=httpx.Limits(max_keepalive_connections=2, max_connections=4),
        )
        _export_client_loop_id = loop_id
    return _export_client


# ── State helpers ────────────────────────────────────────────────────────


async def load_state(key: str, default: dict | None = None) -> dict:
    redis = await get_redis()
    raw = await redis.get(key)
    if raw:
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            pass
    return default or {}


async def save_state(key: str, state: dict) -> None:
    redis = await get_redis()
    await redis.set(key, json.dumps(state))


# ── Queue backlog safety ──────────────────────────────────────────────────


async def check_fast_queue_backlog(caller: str = "") -> tuple[int, bool]:
    """Check the fast queue backlog against the configured threshold.

    Returns (length, throttled) — throttled is True when the queue is over the limit.
    """
    broker_url = settings.celery_broker
    parsed = urlparse(broker_url)
    broker_redis_url = f"redis://{parsed.hostname}:{parsed.port}/0"

    r: aioredis.Redis | None = None
    try:
        r = aioredis.from_url(broker_redis_url, decode_responses=True)
        length = await r.llen("fast") or 0
    except Exception:
        logger.warning("failed to check fast queue backlog", exc_info=True)
        return 0, False
    finally:
        if r is not None:
            await r.aclose()

    threshold = settings.celery_fast_queue_max_backlog
    throttled = length > threshold
    if throttled:
        context = f" ({caller})" if caller else ""
        logger.info(
            f"fast queue backlog throttle active{context}",
            queue_length=length,
            threshold=threshold,
        )
    return length, throttled


# ── TMDB export download ─────────────────────────────────────────────────


async def download_export(export_type: str, caller: str = "seed") -> Path | None:
    """Download a TMDB daily export file. Tries today, then yesterday."""
    now = datetime.now(timezone.utc)
    dates = [now.strftime("%m_%d_%Y")]
    yesterday = now - timedelta(days=1)
    dates.append(yesterday.strftime("%m_%d_%Y"))

    client = _get_export_client()
    for date_str in dates:
        url = f"{TMDB_EXPORT_BASE}/{export_type}_{date_str}.json.gz"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", prefix=f"otix_{caller}_")
        try:
            async with client.stream("GET", url) as response:
                if response.status_code == 404:
                    tmp.close()
                    os.unlink(tmp.name)
                    continue
                response.raise_for_status()
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    tmp.write(chunk)
            tmp.close()
            logger.info(f"{caller} export downloaded", url=url, path=tmp.name)
            return Path(tmp.name)
        except Exception:
            tmp.close()
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
            raise

    logger.warning(f"{caller} export not available", export_type=export_type)
    return None
