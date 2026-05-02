"""Full catalog seeding — concurrent import of people, Steam games, and IGDB games.

Three independent seeders run in parallel, each on its own beat schedule:

  TMDB People: Downloads daily person_ids export, streams in batches.
  Person sync cascades to movies/shows via combined_credits filmography,
  so explicit movie/show exports are unnecessary.

  Steam Games: Downloads GetAppList once, streams app IDs in batches.
  Higher rate limits (100k/day) and smaller catalog than IGDB.

  IGDB Games: Offset pagination, small batches to stay under 4 rps limit.

Each seeder has its own Redis state/lock keys and reaches "done" independently.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Awaitable

import structlog
import httpx

from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

BATCH_ENTRIES = 500
IGDB_LIMIT = 50
IGDB_PAGES_PER_CYCLE = 3
LOCK_TTL = 300
TMDB_EXPORT_BASE = "https://files.tmdb.org/p/exports"
STEAM_APP_LIST_URL = "https://api.steampowered.com/IStoreService/GetAppList/v1/"

# Per-seeder Redis keys
_PEOPLE_STATE = "otix:catalog_seed:people:state"
_PEOPLE_LOCK = "otix:catalog_seed:people:lock"
_PEOPLE_SEEN = "otix:catalog_seed:people:seen"
_STEAM_STATE = "otix:catalog_seed:steam:state"
_STEAM_LOCK = "otix:catalog_seed:steam:lock"
_STEAM_SEEN = "otix:catalog_seed:steam:seen"
_IGDB_STATE = "otix:catalog_seed:igdb:state"
_IGDB_LOCK = "otix:catalog_seed:igdb:lock"
_IGDB_SEEN = "otix:catalog_seed:igdb:seen"

SEEN_TTL = 30 * 86400  # 30 days — covers the full seeding window + restart margin


# ── State helpers ────────────────────────────────────────────────────


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


# ── Dedup helpers ─────────────────────────────────────────────────────


async def _enqueue_if_new(seen_key: str, task_name: str, entry_id: int) -> bool:
    """Enqueue a task only if the ID hasn't been seen before.

    Uses Redis SADD for atomic check-and-add. Returns True if enqueued.
    The seen set gets a TTL so it auto-expires after the seeding window.
    """
    redis = await get_redis()
    added = await redis.sadd(seen_key, str(entry_id))
    if added:
        await redis.expire(seen_key, SEEN_TTL)
        app.send_task(task_name, args=[entry_id])
        return True
    return False


async def _clear_seen(seen_key: str) -> None:
    """Delete the seen set when a seeder completes."""
    redis = await get_redis()
    await redis.delete(seen_key)


# ── Progress reporting ───────────────────────────────────────────────


def _elapsed_str(start_time: float) -> str:
    elapsed = time.monotonic() - start_time
    if elapsed < 60:
        return f"{elapsed:.0f}s"
    if elapsed < 3600:
        return f"{elapsed / 60:.1f}m"
    return f"{elapsed / 3600:.1f}h"


def _log_progress(seeder: str, state: dict, cycle_result: dict | None = None) -> None:
    """Log progress for one seeder."""
    entries = state.get("entries_processed") or state.get("offset", 0)
    total = state.get("total")
    status = "done" if state.get("pipeline") == "done" else "running"

    if total and total > 0:
        pct = entries / total * 100
        msg = f"seed.{seeder} | {entries}/{total} ({pct:.1f}%) | {status}"
    else:
        msg = f"seed.{seeder} | processed={entries} | {status}"

    if cycle_result:
        enqueued = cycle_result.get("enqueued", 0)
        skipped = cycle_result.get("skipped", 0)
        if enqueued:
            msg += f" | enqueued={enqueued}"
        if skipped:
            msg += f" | skipped={skipped}"
        err = cycle_result.get("error") or cycle_result.get("status")
        if err:
            msg += f" | {err}"
    logger.info(msg)


# ── Overall summary ──────────────────────────────────────────────────


async def _log_overall_summary() -> None:
    """Log a one-line summary of all three seeders' progress."""
    people = await _load_state(_PEOPLE_STATE)
    steam = await _load_state(_STEAM_STATE)
    igdb = await _load_state(_IGDB_STATE)

    def _status(s: dict) -> str:
        return "done" if s.get("pipeline") == "done" else "running"

    def _progress(s: dict) -> str:
        entries = s.get("entries_processed") or s.get("offset", 0)
        total = s.get("total")
        if total and total > 0:
            pct = entries / total * 100
            return f"{entries}/{total} ({pct:.1f}%)"
        return str(entries)

    done_count = sum(1 for s in [people, steam, igdb] if s.get("pipeline") == "done")
    msg = (
        f"seed.overall | {done_count}/3 done | "
        f"people: {_progress(people)} [{_status(people)}] | "
        f"steam: {_progress(steam)} [{_status(steam)}] | "
        f"igdb: {_progress(igdb)} [{_status(igdb)}]"
    )
    logger.info(msg)


# ── Generic seed loop ────────────────────────────────────────────────


async def _seed_loop(
    seeder_name: str,
    state_key: str,
    lock_key: str,
    process_fn: Callable[[dict], Awaitable[dict]],
) -> dict:
    """Acquire lock, load state, run one batch, save, release."""
    redis = await get_redis()
    acquired = await redis.set(lock_key, "1", nx=True, ex=LOCK_TTL)
    if not acquired:
        return {"status": "locked"}

    try:
        state = await _load_state(state_key)

        if state.get("pipeline") == "done":
            return {"pipeline": "done"}

        result = await process_fn(state)
        _log_progress(seeder_name, state, cycle_result=result)
        await _log_overall_summary()
        return result
    finally:
        await redis.delete(lock_key)


# ── Beat tasks ───────────────────────────────────────────────────────


@app.task(name="seed.people_cycle", queue="default")
def seed_people_cycle() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_seed_loop("people", _PEOPLE_STATE, _PEOPLE_LOCK, _process_people_batch))


@app.task(name="seed.steam_cycle", queue="default")
def seed_steam_cycle() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_seed_loop("steam", _STEAM_STATE, _STEAM_LOCK, _process_steam_batch))


@app.task(name="seed.igdb_cycle", queue="default")
def seed_igdb_cycle() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_seed_loop("igdb", _IGDB_STATE, _IGDB_LOCK, _process_igdb_batch))


# ── TMDB export download ─────────────────────────────────────────────


async def _download_export(export_type: str) -> Path | None:
    from datetime import timedelta as _td

    now = datetime.now(timezone.utc)
    dates = [now.strftime("%m_%d_%Y")]
    yesterday = now - _td(days=1)
    dates.append(yesterday.strftime("%m_%d_%Y"))

    for date_str in dates:
        url = f"{TMDB_EXPORT_BASE}/{export_type}_{date_str}.json.gz"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", prefix="otix_seed_")
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
            logger.info("seed export downloaded", url=url, path=tmp.name)
            return Path(tmp.name)
        except Exception:
            tmp.close()
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
            raise

    logger.warning("seed export not available", export_type=export_type)
    return None


# ── TMDB People seeder ───────────────────────────────────────────────


async def _process_people_batch(state: dict) -> dict:
    """Process BATCH_ENTRIES entries from the TMDB person_ids export."""
    export_type = "person_ids"
    task_name = "sync.tmdb.person"
    state_key = _PEOPLE_STATE

    file_path = state.get("file_path")
    if file_path and not os.path.exists(file_path):
        file_path = None

    if not file_path:
        path = await _download_export(export_type)
        if path is None:
            return {"status": "export_unavailable"}
        file_path = str(path)
        state["file_path"] = file_path
        state["entries_processed"] = 0
        await _save_state(state_key, state)

    entries_processed = state.get("entries_processed", 0)
    start = entries_processed
    end = start + BATCH_ENTRIES

    enqueued = 0
    skipped = 0
    current = 0

    try:
        with gzip.open(file_path, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line in ("[", "]", "{", "{}"):
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
                if isinstance(entry_id, int):
                    if await _enqueue_if_new(_PEOPLE_SEEN, task_name, entry_id):
                        enqueued += 1
                    else:
                        skipped += 1

                current += 1

    except Exception:
        logger.warning("seed people batch failed", entries_processed=entries_processed, exc_info=True)
        return {"entries_processed": entries_processed, "enqueued": enqueued, "skipped": skipped, "error": "batch_failed"}

    new_processed = max(current, start + enqueued + skipped)
    state["entries_processed"] = new_processed

    if current < end:  # File exhausted
        try:
            os.unlink(file_path)
        except OSError:
            pass
        state.pop("file_path", None)
        state.pop("entries_processed", None)
        state["pipeline"] = "done"
        await _clear_seen(_PEOPLE_SEEN)
        logger.info("seed people complete", total_entries=new_processed, enqueued=enqueued, skipped=skipped)
    else:
        logger.info("seed people batch", start=start, end=current, enqueued=enqueued, skipped=skipped)

    await _save_state(state_key, state)
    return {"entries_processed": new_processed, "enqueued": enqueued, "skipped": skipped}


# ── Steam seeder ─────────────────────────────────────────────────────


async def _download_steam_app_list(last_appid: int = 0) -> Path | None:
    from otix.infrastructure.config import settings

    if not settings.steam_api_key:
        logger.warning("seed steam skipped — no Steam API key configured")
        return None

    url = f"{STEAM_APP_LIST_URL}?key={settings.steam_api_key}&include_games=true&include_dlc=false&max_results=50000"
    if last_appid:
        url += f"&last_appid={last_appid}"

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", prefix="otix_seed_steam_")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("GET", url) as response:
                if response.status_code == 403:
                    logger.warning("seed steam skipped — API key lacks store access", status=403)
                    tmp.close()
                    os.unlink(tmp.name)
                    return None
                response.raise_for_status()
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    tmp.write(chunk)
        tmp.close()
        logger.info("seed steam app list downloaded", path=tmp.name)
        return Path(tmp.name)
    except Exception:
        tmp.close()
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise


async def _process_steam_batch(state: dict) -> dict:
    """Process BATCH_ENTRIES entries from the Steam app list (with pagination)."""
    state_key = _STEAM_STATE

    file_path = state.get("file_path")
    if file_path and not os.path.exists(file_path):
        file_path = None

    if not file_path:
        last_appid = state.get("last_appid", 0)
        path = await _download_steam_app_list(last_appid)
        if path is None:
            state["pipeline"] = "done"
            await _save_state(state_key, state)
            return {"status": "steam_unavailable", "pipeline": "done"}
        file_path = str(path)
        state["file_path"] = file_path
        state["page_offset"] = 0
        await _save_state(state_key, state)

    cumulative = state.get("entries_processed", 0)
    page_offset = state.get("page_offset", 0)
    enqueued = 0
    skipped = 0
    current_offset = 0

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        response_data = data.get("response", {})
        apps = response_data.get("apps", [])
        if not isinstance(apps, list):
            apps = []
        have_more = response_data.get("have_more_results", False)
        next_cursor = response_data.get("last_appid", 0)

        page_size = len(apps)
        start = page_offset
        end = min(start + BATCH_ENTRIES, page_size)

        for i in range(start, end):
            entry = apps[i]
            if not isinstance(entry, dict):
                continue
            app_id = entry.get("appid")
            if isinstance(app_id, int):
                if await _enqueue_if_new(_STEAM_SEEN, "sync.steam.update_app", app_id):
                    enqueued += 1
                else:
                    skipped += 1

        current_offset = end

    except Exception:
        logger.warning("seed steam batch failed", entries_processed=cumulative, exc_info=True)
        return {"entries_processed": cumulative, "enqueued": enqueued, "skipped": skipped, "error": "batch_failed"}

    # Advance cumulative count
    processed_this_batch = current_offset - page_offset
    cumulative += processed_this_batch
    state["entries_processed"] = cumulative
    state["page_offset"] = current_offset

    if current_offset >= page_size:
        # Page exhausted — clean up and optionally fetch next page
        try:
            os.unlink(file_path)
        except OSError:
            pass
        state.pop("file_path", None)
        state.pop("page_offset", None)

        if have_more and next_cursor:
            state["last_appid"] = next_cursor
            logger.info("seed steam page done", page_size=page_size, cumulative=cumulative, next_cursor=next_cursor)
        else:
            state.pop("last_appid", None)
            state["pipeline"] = "done"
            await _clear_seen(_STEAM_SEEN)
            logger.info("seed steam complete", total_entries=cumulative, enqueued=enqueued, skipped=skipped)
    else:
        logger.info("seed steam batch", start=start, end=current_offset, enqueued=enqueued, skipped=skipped, page_size=page_size)

    await _save_state(state_key, state)
    return {"entries_processed": cumulative, "enqueued": enqueued, "skipped": skipped}


# ── IGDB seeder ──────────────────────────────────────────────────────


async def _process_igdb_batch(state: dict) -> dict:
    """Process IGDB_PAGES_PER_CYCLE offset pages."""
    from otix.infrastructure.redis import get_redis as _get_redis
    from otix.providers.igdb.client import IGDBProvider

    state_key = _IGDB_STATE
    offset = state.get("offset", 0)
    total_enqueued = 0
    total_skipped = 0

    for _ in range(IGDB_PAGES_PER_CYCLE):
        redis = await _get_redis()
        provider = IGDBProvider(redis)

        try:
            results = await provider.get_games_offset(offset=offset, limit=IGDB_LIMIT, fields="id")
        except Exception:
            logger.warning("seed igdb offset failed", offset=offset, exc_info=True)
            break

        if not results:
            state["pipeline"] = "done"
            await _clear_seen(_IGDB_SEEN)
            logger.info("seed igdb complete")
            break

        for item in results:
            game_id = item.get("id")
            if game_id:
                if await _enqueue_if_new(_IGDB_SEEN, "sync.igdb.game", int(game_id)):
                    total_enqueued += 1
                else:
                    total_skipped += 1

        offset += len(results)
        state["offset"] = offset
        await asyncio.sleep(1.0)

    await _save_state(state_key, state)

    if total_enqueued or total_skipped:
        logger.info("seed igdb batch", offset=state.get("offset"), enqueued=total_enqueued, skipped=total_skipped)

    return {"offset": state.get("offset"), "enqueued": total_enqueued, "skipped": total_skipped}
