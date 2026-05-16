"""TMDB daily export import + backlog processor.

Two pipelines:

1. Export import (seed.tmdb_export_cycle): Downloads one TMDB export file per
   cycle, bulk-inserts ExternalID stub records, and tracks progress in Redis.

2. Backlog processor (seed.tmdb_backlog_cycle): Queries stubs with
   media_item_id IS NULL and dispatches sync tasks, prioritizing non-adult
   content first.
"""

from __future__ import annotations

import gzip
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from otix.domain.media import ExternalID
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

TMDB_EXPORT_BASE = "https://files.tmdb.org/p/exports"
BATCH_INSERT_SIZE = 10_000
BACKLOG_BATCH_SIZE = 500

# Redis keys
_EXPORT_STATE = "otix:tmdb_seed:export_state"
_EXPORT_LOCK = "otix:tmdb_seed:export_lock"
_EXPORT_LOCK_TTL = 600
_BACKLOG_STATE = "otix:tmdb_seed:backlog_state"
_BACKLOG_LOCK = "otix:tmdb_seed:backlog_lock"
_BACKLOG_LOCK_TTL = 300

# ── Export file → media_type + is_adult ─────────────────────────────────

_EXPORT_FILES: list[dict] = [
    {"file": "movie_ids", "media_type": "movie", "is_adult": False},
    {"file": "tv_series_ids", "media_type": "show", "is_adult": False},
    {"file": "person_ids", "media_type": "person", "is_adult": False},
    {"file": "collection_ids", "media_type": "collection", "is_adult": False},
    {"file": "tv_network_ids", "media_type": "network", "is_adult": False},
    {"file": "keyword_ids", "media_type": "keyword", "is_adult": False},
    {"file": "production_company_ids", "media_type": "company", "is_adult": False},
    {"file": "adult_movie_ids", "media_type": "movie", "is_adult": True},
    {"file": "adult_tv_series_ids", "media_type": "show", "is_adult": True},
    {"file": "adult_person_ids", "media_type": "person", "is_adult": True},
]

# ── Backlog dispatch: media_type → (task_name, extra_args) ──────────────

_BACKLOG_DISPATCH: dict[str, tuple[str, list]] = {
    "movie": ("sync.tmdb.movie", []),
    "show": ("sync.tmdb.show", []),
    "person": ("sync.tmdb.person", []),
    "collection": ("sync.tmdb.collection", []),
    "company": ("sync.tmdb.company", ["company"]),
    "network": ("sync.tmdb.company", ["network"]),
    "keyword": ("sync.tmdb.keyword", []),
}


# ── Queue safety ───────────────────────────────────────────────────────


async def _check_fast_queue_backlog() -> tuple[int, bool]:
    broker_url = settings.celery_broker
    parsed = urlparse(broker_url)
    broker_redis_url = f"redis://{parsed.hostname}:{parsed.port}/0"

    r = None
    try:
        import redis.asyncio as aioredis
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
        logger.info("fast queue backlog throttle active (tmdb seed)", queue_length=length, threshold=threshold)
    return length, throttled


# ── Export download ─────────────────────────────────────────────────────


async def _download_export(export_type: str) -> Path | None:
    now = datetime.now(timezone.utc)
    dates = [now.strftime("%m_%d_%Y")]
    yesterday = now - timedelta(days=1)
    dates.append(yesterday.strftime("%m_%d_%Y"))

    for date_str in dates:
        url = f"{TMDB_EXPORT_BASE}/{export_type}_{date_str}.json.gz"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", prefix="otix_tmdb_seed_")
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                async with client.stream("GET", url) as response:
                    if response.status_code == 404:
                        tmp.close()
                        os.unlink(tmp.name)
                        continue
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        tmp.write(chunk)
            tmp.close()
            logger.info("tmdb seed export downloaded", url=url, path=tmp.name)
            return Path(tmp.name)
        except Exception:
            tmp.close()
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
            raise

    logger.warning("tmdb seed export not available", export_type=export_type)
    return None


# ── State helpers ──────────────────────────────────────────────────────


async def _load_state(key: str, default: dict | None = None) -> dict:
    redis = await get_redis()
    raw = await redis.get(key)
    if raw:
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            pass
    return default or {}


async def _save_state(key: str, state: dict) -> None:
    redis = await get_redis()
    await redis.set(key, json.dumps(state))


# ── Export cycle ────────────────────────────────────────────────────────


async def _process_export_batch(state: dict) -> dict:
    """Download the next unprocessed export file and bulk-insert ExternalID stubs.

    State tracks:
      - file_index: which export file we're on (0-9)
      - file_path: temp path of the downloaded .json.gz
      - entries_processed: line offset within the file
    """
    file_index = state.get("file_index", 0)
    if file_index >= len(_EXPORT_FILES):
        state["pipeline"] = "done"
        await _save_state(_EXPORT_STATE, state)
        return {"status": "all_exports_done"}

    cfg = _EXPORT_FILES[file_index]
    export_type = cfg["file"]
    media_type = cfg["media_type"]
    is_adult = cfg["is_adult"]

    file_path = state.get("file_path")
    if file_path and not os.path.exists(file_path):
        file_path = None
        state.pop("file_path", None)
        state.pop("entries_processed", None)

    if not file_path:
        path = await _download_export(export_type)
        if path is None:
            # Export not available yet — advance to next file
            file_index += 1
            state["file_index"] = file_index
            state.pop("file_path", None)
            state.pop("entries_processed", None)
            await _save_state(_EXPORT_STATE, state)
            return {"status": "export_unavailable", "export_type": export_type, "advanced_to": file_index}
        file_path = str(path)
        state["file_path"] = file_path
        state["entries_processed"] = 0

    entries_processed = state.get("entries_processed", 0)
    start = entries_processed
    end = start + BATCH_INSERT_SIZE

    rows: list[dict] = []
    current = 0

    try:
        with gzip.open(file_path, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line in ("[", "]", "{", "}"):
                    continue
                if line.endswith(","):
                    line = line[:-1]

                if current < start:
                    current += 1
                    continue
                if current >= end:
                    break

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    current += 1
                    continue

                entry_id = entry.get("id")
                if not isinstance(entry_id, int):
                    current += 1
                    continue

                rows.append({
                    "provider": "tmdb",
                    "external_id": str(entry_id),
                    "media_type": media_type,
                    "is_adult": is_adult,
                })
                current += 1

    except Exception:
        logger.warning("tmdb seed export batch failed", export_type=export_type, entries_processed=entries_processed, exc_info=True)
        return {"export_type": export_type, "entries_processed": entries_processed, "rows_inserted": 0, "error": "batch_failed"}

    # Bulk insert
    inserted = 0
    if rows:
        async with async_session() as session:
            stmt = pg_insert(ExternalID.__table__).values(rows).on_conflict_do_nothing(
                constraint="uq_external_id_provider_ext"
            )
            result = await session.execute(stmt)
            inserted = result.rowcount
            await session.commit()

    new_processed = current
    state["entries_processed"] = new_processed

    if current < end:
        # File exhausted — advance to next
        try:
            os.unlink(file_path)
        except OSError:
            pass
        file_index += 1
        state["file_index"] = file_index
        state.pop("file_path", None)
        state.pop("entries_processed", None)
        logger.info("tmdb seed export file complete", export_type=export_type, total_entries=new_processed, inserted=inserted)
    else:
        logger.info("tmdb seed export batch", export_type=export_type, start=start, end=current, inserted=inserted)

    await _save_state(_EXPORT_STATE, state)
    return {"export_type": export_type, "entries_processed": new_processed, "rows_inserted": inserted}


# ── Backlog cycle ──────────────────────────────────────────────────────


async def _process_backlog_batch(state: dict) -> dict:
    """Query ExternalID stubs with media_item_id IS NULL and dispatch sync tasks.

    Prioritizes non-adult content first. Self-chains when the batch is full
    and the queue is not throttled.
    """
    _, throttled = await _check_fast_queue_backlog()
    if throttled:
        return {"status": "throttled"}

    async with async_session() as session:
        stubs = await session.scalars(
            select(ExternalID).where(
                ExternalID.provider == "tmdb",
                ExternalID.media_item_id.is_(None),
            ).order_by(
                ExternalID.is_adult.asc(),
                ExternalID.created_at.asc(),
            ).limit(BACKLOG_BATCH_SIZE)
        )
        stub_list = list(stubs)

    if not stub_list:
        return {"status": "empty", "dispatched": 0}

    dispatched = 0
    for stub in stub_list:
        media_type = stub.media_type or "movie"
        task_name, extra_args = _BACKLOG_DISPATCH.get(media_type, ("sync.tmdb.movie", []))
        app.send_task(task_name, args=[int(stub.external_id)] + extra_args)
        dispatched += 1

    logger.info("tmdb seed backlog batch dispatched", dispatched=dispatched)

    if dispatched >= BACKLOG_BATCH_SIZE and not throttled:
        app.send_task("seed.tmdb_backlog_cycle")

    return {"status": "ok", "dispatched": dispatched}


# ── Beat tasks ──────────────────────────────────────────────────────────


@app.task(name="seed.tmdb_export_cycle", queue="default")
def seed_tmdb_export_cycle() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_seed_export_loop())


@app.task(name="seed.tmdb_backlog_cycle", queue="default")
def seed_tmdb_backlog_cycle() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_seed_backlog_loop())


async def _seed_export_loop() -> dict:
    redis = await get_redis()
    acquired = await redis.set(_EXPORT_LOCK, "1", nx=True, ex=_EXPORT_LOCK_TTL)
    if not acquired:
        return {"status": "locked"}

    try:
        state = await _load_state(_EXPORT_STATE)
        if state.get("pipeline") == "done":
            return {"pipeline": "done"}

        result = await _process_export_batch(state)
        logger.info("tmdb seed export cycle", **result)
        return result
    finally:
        await redis.delete(_EXPORT_LOCK)


async def _seed_backlog_loop() -> dict:
    redis = await get_redis()
    acquired = await redis.set(_BACKLOG_LOCK, "1", nx=True, ex=_BACKLOG_LOCK_TTL)
    if not acquired:
        return {"status": "locked"}

    try:
        state = await _load_state(_BACKLOG_STATE)
        result = await _process_backlog_batch(state)
        logger.info("tmdb seed backlog cycle", **result)
        return result
    finally:
        await redis.delete(_BACKLOG_LOCK)
