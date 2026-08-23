# TODO: Review this file
"""TMDB daily export import + backlog processor.

Two pipelines:

1. Daily import (seed.tmdb_daily_import): Downloads all 10 TMDB export files,
   bulk-inserts ExternalID stubs, then detects deleted IDs. Runs once per day.

2. Backlog processor (seed.tmdb_backlog_cycle): Queries stubs with
   media_item_id IS NULL and dispatches sync tasks with a proportional mix
   of movie/show types (250/250 per batch). People are excluded — they sync
   via seed.people_cycle and credit cascades. Runs every 1 min.
"""

from __future__ import annotations

import gzip
import json
import os
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from otix.domain.media import ExternalID, MediaItem, TMDBDeletedID
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis

try:
    from redis.exceptions import BusyLoadingError as _RedisBusyLoadingError
    from redis.exceptions import ConnectionError as _RedisConnectionError
    _REDIS_ERRORS = (_RedisBusyLoadingError, _RedisConnectionError, OSError)
except ImportError:  # pragma: no cover
    _REDIS_ERRORS = (OSError,)

from otix.tasks.seed import (
    check_fast_queue_backlog,
    download_export,
)

logger = structlog.get_logger()


def _stub_insert_cols() -> int:
    """Bound params per stub row in the bulk INSERT.

    SQLAlchemy folds columns with Python-side defaults into multi-row inserts
    (id, hash_match_count, confirmed_count, confirmed_by, ...), so each row
    binds more params than the 4 explicit stub columns. Derive the count from
    the compiled statement so batch sizing stays correct as the model evolves.
    """
    import re

    from sqlalchemy.dialects.postgresql import insert as pg_insert

    probe = pg_insert(ExternalID.__table__).values(
        [{"provider": "x", "external_id": "0", "media_type": "movie", "is_adult": False}]
    )
    sql = str(probe.compile())
    return len(set(re.findall(r"%\(([a-z_0-9]+)\)s", sql)))


# Max rows per INSERT — stays under PostgreSQL's 32767-argument limit with headroom.
BATCH_INSERT_SIZE = max(1, 32_767 // _stub_insert_cols() - 16)
BACKLOG_BATCH_SIZE = 200

# Backward-compatible aliases for internal use
_check_fast_queue_backlog = check_fast_queue_backlog
_download_export = download_export

# Redis keys
_EXPORT_LOCK_TTL = 7200  # 2 hours for daily import
_BACKLOG_LOCK = "otix:tmdb_seed:backlog_lock"
_BACKLOG_LOCK_TTL = 120

_daily_lock_key: str | None = None  # set in _daily_import_loop with today's date

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


# ── Daily import ───────────────────────────────────────────────────────


async def _bulk_insert_stubs(rows: list[dict]) -> int:
    """Insert ExternalID stubs with on_conflict_do_nothing. Returns rowcount.

    Stubs carry entity_type=NULL (they are unresolved placeholders). The
    global unique index on (provider, external_id, media_type) makes a stub
    for an already-resolved id conflict with the media row, so re-imports are
    true no-ops.
    """
    if not rows:
        return 0
    async with async_session() as session:
        # Target the global uq_external_id_provider_media_type index. A stub for
        # an already-resolved id conflicts with the media row and is skipped,
        # so the daily import stops re-seeding resolved ids.
        stmt = pg_insert(ExternalID.__table__).values(rows).on_conflict_do_nothing(
            index_elements=["provider", "external_id", "media_type"],
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount


async def _import_export_file(export_type: str, media_type: str, is_adult: bool = False) -> dict:
    """Download and fully import one TMDB export file.

    Returns counts only for newly inserted rows. Already-existing IDs
    are silently skipped via on_conflict_do_nothing so daily re-import
    of the same IDs is a cheap no-op.
    """
    path = await _download_export(export_type)
    if path is None:
        return {"export_type": export_type, "status": "unavailable", "total": 0, "inserted": 0}

    try:
        rows: list[dict] = []
        total = 0
        inserted = 0

        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line in ("[", "]", "{", "}"):
                    continue
                if line.endswith(","):
                    line = line[:-1]

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                entry_id = entry.get("id")
                if not isinstance(entry_id, int):
                    continue

                rows.append({
                    "provider": "tmdb",
                    "external_id": str(entry_id),
                    "media_type": media_type,
                    "is_adult": is_adult,
                })
                total += 1

                if len(rows) >= BATCH_INSERT_SIZE:
                    inserted += await _bulk_insert_stubs(rows)
                    rows.clear()

        if rows:
            inserted += await _bulk_insert_stubs(rows)

        logger.info("tmdb daily import file complete",
                    export_type=export_type, total=total, inserted=inserted)
        return {"export_type": export_type, "total": total, "inserted": inserted}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


# ── Backlog cycle ──────────────────────────────────────────────────────


# Proportional split per media_type so each batch includes movies and shows
# rather than starving shows. People are excluded — they sync via
# seed.people_cycle and credit cascades, not via ExternalID stubs
# (ExternalID.media_item_id FK points to media_items, not people).
# When a type exhausts its stubs the other expands to fill the batch.
_BACKLOG_TYPE_SPLIT: list[tuple[str, int]] = [
    ("movie", 250),
    ("show", 250),
]


async def _process_backlog_batch(state: dict) -> dict:
    """Query ExternalID stubs and dispatch sync tasks with mixed media types.

    Queries each media_type separately with proportional limits so every
    batch contains both movies and shows. People are excluded — they sync
    via seed.people_cycle and credit cascades (ExternalID FK targets
    media_items, not people). Non-adult stubs ordered first within each type.
    """
    _, throttled = await _check_fast_queue_backlog()
    if throttled:
        return {"status": "throttled"}

    async with async_session() as session:
        stub_list: list[ExternalID] = []
        seen: set[int] = set()

        for media_type, limit in _BACKLOG_TYPE_SPLIT:
            stubs = await session.scalars(
                select(ExternalID).where(
                    ExternalID.provider == "tmdb",
                    ExternalID.media_item_id.is_(None),
                    ExternalID.media_type == media_type,
                ).order_by(
                    ExternalID.is_adult.asc(),
                    ExternalID.created_at.asc(),
                ).limit(limit)
            )
            for stub in stubs:
                if stub.id not in seen:
                    stub_list.append(stub)
                    seen.add(stub.id)

        # If any type exhausted its quota, fill remainder with genuine media
        # stubs (entity_id NULL) from the most abundant types. Already-resolved
        # non-media rows (people/keywords/collections) set entity_id but leave
        # media_item_id NULL — they must be excluded or they'd be misdispatched
        # as movies.
        if len(stub_list) < BACKLOG_BATCH_SIZE:
            remaining = BACKLOG_BATCH_SIZE - len(stub_list)
            extra_stubs = await session.scalars(
                select(ExternalID).where(
                    ExternalID.provider == "tmdb",
                    ExternalID.media_item_id.is_(None),
                    ExternalID.entity_id.is_(None),
                    ExternalID.id.notin_(seen) if seen else True,
                ).order_by(
                    ExternalID.is_adult.asc(),
                    ExternalID.created_at.asc(),
                ).limit(remaining)
            )
            for stub in extra_stubs:
                if stub.id not in seen:
                    stub_list.append(stub)
                    seen.add(stub.id)

    if not stub_list:
        return {"status": "empty", "dispatched": 0}

    dispatched = 0
    for stub in stub_list:
        media_type = stub.media_type or "movie"
        task_name, extra_args = _BACKLOG_DISPATCH.get(media_type, ("sync.tmdb.movie", []))
        app.send_task(task_name, args=[int(stub.external_id)] + extra_args)
        dispatched += 1

    logger.info("tmdb seed backlog batch dispatched", dispatched=dispatched)
    return {"status": "ok", "dispatched": dispatched}


# ── Beat tasks ──────────────────────────────────────────────────────────


@app.task(name="seed.tmdb_daily_import")
def seed_tmdb_daily_import() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_daily_import_loop())


@app.task(name="seed.tmdb_backlog_cycle")
def seed_tmdb_backlog_cycle() -> dict:
    from otix.lib.concurrency import run_async
    return run_async(_seed_backlog_loop())


async def _daily_import_loop() -> dict:
    """Daily import: download all TMDB exports, insert stubs, detect deletions.

    Uses a date-stamped lock so it runs at most once per calendar day.
    Already-existing IDs are skipped via on_conflict_do_nothing, so daily
    re-import of the same IDs is cheap.
    """
    redis = await get_redis()
    date_key = datetime.now(UTC).strftime("%Y%m%d")
    lock_key = f"otix:tmdb_seed:daily_lock:{date_key}"
    acquired = await redis.set(lock_key, "1", nx=True, ex=_EXPORT_LOCK_TTL)
    if not acquired:
        return {"status": "locked", "date": date_key}

    try:
        file_results = []

        for cfg in _EXPORT_FILES:
            export_type = cfg["file"]
            media_type = cfg["media_type"]
            is_adult = cfg["is_adult"]

            result = await _import_export_file(export_type, media_type, is_adult)
            file_results.append(result)

            if result.get("total", 0) > 0 and "status" not in result:
                # Track valid IDs for this media_type for deletion detection.
                # We need to re-read the file to collect IDs. Only pay this
                # cost once per media_type group (non-adult + adult combined).
                pass

        total_inserted = sum(r.get("inserted", 0) for r in file_results)
        logger.info("tmdb daily import complete",
                    total_inserted=total_inserted, files=len(file_results))

        # Deletion detection after import
        deletion_results = await _detect_deletions_after_import()

        return {
            "status": "ok",
            "date": date_key,
            "total_inserted": total_inserted,
            "files": file_results,
            "deletion": deletion_results,
        }
    finally:
        try:
            # Keep the lock until expiry (prevents same-day re-run).
            # Refresh TTL in case the import took a while.
            await redis.expire(lock_key, _EXPORT_LOCK_TTL)
        except _REDIS_ERRORS:
            pass  # Lock will expire on its own via TTL


async def _detect_deletions_after_import() -> dict:
    """Detect TMDB IDs in our DB that are no longer in the daily exports.

    Re-downloads each export file to build the valid-ID set, then compares
    against our DB. Only called after the daily import completes, so the
    exports are guaranteed to be available (just downloaded them).
    """
    media_type_files = {
        "movie": ["movie_ids", "adult_movie_ids"],
        "show": ["tv_series_ids", "adult_tv_series_ids"],
        "person": ["person_ids", "adult_person_ids"],
        "collection": ["collection_ids"],
        "network": ["tv_network_ids"],
        "company": ["production_company_ids"],
        "keyword": ["keyword_ids"],
    }

    total_deleted = 0
    total_inserted = 0

    for media_type, export_types in media_type_files.items():
        valid_ids: set[int] = set()

        for export_type in export_types:
            path = await _download_export(export_type)
            if path is None:
                continue

            try:
                with gzip.open(path, "rt", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line in ("[", "]", "{", "}"):
                            continue
                        if line.endswith(","):
                            line = line[:-1]
                        try:
                            entry = json.loads(line)
                            if isinstance(entry.get("id"), int):
                                valid_ids.add(entry["id"])
                        except json.JSONDecodeError:
                            continue
            finally:
                try:
                    os.unlink(path)
                except OSError:
                    pass

        if not valid_ids:
            continue

        async with async_session() as session:
            result = await session.execute(
                select(
                    ExternalID.external_id,
                    ExternalID.media_item_id,
                ).where(
                    ExternalID.provider == "tmdb",
                    ExternalID.media_type == media_type,
                )
            )
            db_records = result.all()

        deleted: list[dict] = []
        for ext_id_str, media_item_id in db_records:
            if int(ext_id_str) not in valid_ids:
                deleted.append({
                    "tmdb_id": int(ext_id_str),
                    "media_type": media_type,
                    "media_item_id": media_item_id,
                    "title": None,
                })

        if deleted:
            mids = [d["media_item_id"] for d in deleted if d["media_item_id"]]
            mids_with_titles: dict[str, str] = {}
            if mids:
                async with async_session() as session:
                    result = await session.execute(
                        select(MediaItem.id, MediaItem.title).where(MediaItem.id.in_(mids))
                    )
                    mids_with_titles = {row[0]: row[1] for row in result}

            for d in deleted:
                if d["media_item_id"]:
                    d["title"] = mids_with_titles.get(d["media_item_id"])

            async with async_session() as session:
                stmt = pg_insert(TMDBDeletedID.__table__).values(deleted).on_conflict_do_nothing(
                    constraint="uq_tmdb_deleted_id"
                )
                result = await session.execute(stmt)
                await session.commit()
                inserted = result.rowcount

            total_deleted += len(deleted)
            total_inserted += inserted
            logger.info("tmdb deletion detected",
                        media_type=media_type, deleted=len(deleted), inserted=inserted)

    logger.info("tmdb deletion scan complete", total_deleted=total_deleted, total_inserted=total_inserted)
    return {"total_deleted": total_deleted, "total_inserted": total_inserted}


async def _seed_backlog_loop() -> dict:
    redis = await get_redis()
    try:
        acquired = await redis.set(_BACKLOG_LOCK, "1", nx=True, ex=_BACKLOG_LOCK_TTL)
    except _REDIS_ERRORS:
        # Redis unavailable — skip this cycle rather than crash
        return {"status": "redis_unavailable"}
    if not acquired:
        return {"status": "locked"}

    try:
        result = await _process_backlog_batch({})
        logger.info("tmdb seed backlog cycle", **result)
        return result
    finally:
        try:
            await redis.delete(_BACKLOG_LOCK)
        except _REDIS_ERRORS:
            pass  # Lock TTL will expire naturally
