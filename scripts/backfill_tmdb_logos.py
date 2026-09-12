"""Backfill TMDB logos into media_assets for items that have a TMDB external id.

Idempotent: skips items that already have a TMDB logo asset, so a re-run resumes
without re-fetching completed items. Uses the shared TMDBProvider rate limiter
(Redis token bucket, 40 rps) with a bounded worker pool.

Usage:
    python -m scripts.backfill_tmdb_logos            # full run
    python -m scripts.backfill_tmdb_logos --limit 50 # smoke-test first N items
    python -m scripts.backfill_tmdb_logos --workers 12
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import time

import httpx

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from otix.domain.asset import MediaAsset
from otix.domain.media import ExternalID, MediaItem
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis
from otix.providers.base import CircuitOpenError, ProviderError
from otix.providers.tmdb import TMDBProvider
from otix.providers.tmdb.hydrator import TMDBHydrator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("backfill_tmdb_logos")

# Bulk backfill: tolerate short provider hiccups without the breaker wedging.
# Default breaker (threshold 5, recovery 30s) trips on any 1-2s blip under
# 30-way concurrency, then drains the whole queue as instant failures.
CIRCUIT_THRESHOLD = 50
CIRCUIT_RECOVERY = 5.0
MAX_RETRIES = 3


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="max items to process (0 = all)")
    parser.add_argument("--workers", type=int, default=20)
    args = parser.parse_args()

    engine = create_async_engine(settings.database_url, pool_size=args.workers + 4, max_overflow=20)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    redis = await get_redis()
    provider = TMDBProvider(
        redis,
        circuit_threshold=CIRCUIT_THRESHOLD,
        circuit_recovery=CIRCUIT_RECOVERY,
    )

    async with Session() as s:
        # Items that already have a TMDB logo (resume checkpoint).
        done = set(
            (
                await s.execute(
                    select(MediaAsset.media_item_id).where(
                        MediaAsset.asset_type == "logo", MediaAsset.provider == "tmdb"
                    )
                )
            ).scalars()
        )
        rows = (
            await s.execute(
                select(ExternalID.entity_id, MediaItem.media_type, ExternalID.external_id)
                .join(MediaItem, MediaItem.id == ExternalID.entity_id)
                .where(
                    ExternalID.provider == "tmdb",
                    ExternalID.entity_type == "media_item",
                    MediaItem.media_type.in_(["movie", "show"]),
                )
            )
        ).fetchall()

    queue: asyncio.Queue = asyncio.Queue()
    total = 0
    for mi_id, mtype, tmdb_id in rows:
        if mi_id in done:
            continue
        queue.put_nowait((mi_id, mtype, int(tmdb_id), 0))
        total += 1
        if args.limit and total >= args.limit:
            break

    log.info(f"starting backfill pending={total} already_done={len(done)}")

    start = time.monotonic()
    counts = {"ok": 0, "err": 0, "added_logos": 0}
    lock = asyncio.Lock()

    async def worker() -> None:
        async with Session() as s:
            hydrator = TMDBHydrator(provider, s)
            while True:
                item = await queue.get()
                mi_id, mtype, tmdb_id, attempts = item
                try:
                    raw = (
                        await provider.get_movie_images(tmdb_id)
                        if mtype == "movie"
                        else await provider.get_show_images(tmdb_id)
                    )
                    logos = raw.get("logos", []) if isinstance(raw, dict) else []
                    media_item = await s.get(MediaItem, mi_id)
                    if media_item is not None:
                        await hydrator.hydrate_images(media_item, {"images": raw})
                        await s.commit()
                    async with lock:
                        counts["ok"] += 1
                        counts["added_logos"] += len(logos)
                except (CircuitOpenError, ProviderError, httpx.TransportError, TimeoutError) as exc:
                    await s.rollback()
                    if attempts < MAX_RETRIES:
                        # Transient network/breaker failure — retry after backoff
                        # so the breaker's recovery window elapses before we resubmit.
                        await asyncio.sleep(min(2**attempts, 10))
                        queue.put_nowait((mi_id, mtype, tmdb_id, attempts + 1))
                    else:
                        async with lock:
                            counts["err"] += 1
                        if counts["err"] % 25 == 1:
                            log.exception(f"item failed item_id={mi_id} attempts={attempts} {type(exc).__name__}")
                except Exception:
                    await s.rollback()
                    async with lock:
                        counts["err"] += 1
                    if counts["err"] % 25 == 1:
                        log.exception(f"item failed item_id={mi_id}")
                finally:
                    queue.task_done()
                    async with lock:
                        n = counts["ok"] + counts["err"]
                        if n % 500 == 0:
                            el = time.monotonic() - start
                            rate = n / el if el else 0
                            log.info(
                                f"progress done={n}/{total} ok={counts['ok']} err={counts['err']} "
                                f"added_logos={counts['added_logos']} rate={rate:.1f}/s "
                                f"eta_min={(total - n) / rate / 60 if rate else 0:.0f}"
                            )

    workers = [asyncio.create_task(worker()) for _ in range(args.workers)]
    await queue.join()
    for w in workers:
        w.cancel()
    await asyncio.gather(*workers, return_exceptions=True)

    el = time.monotonic() - start
    log.info(
        f"backfill complete ok={counts['ok']} err={counts['err']} "
        f"added_logos={counts['added_logos']} elapsed_min={el / 60:.1f}"
    )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
