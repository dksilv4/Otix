"""TMDB provider benchmark.

Measures API fetch latency and full pipeline throughput for:
  - Single media (movie / show)
  - Discovery lists (popular movies / popular shows)
  - Batch fan-out: fetch N pages, then fetch each item individually

Usage:
  # Fetch-only mode (no DB/Redis needed, just TMDB API key in .env):
  python -m tests.benchmark_tmdb

  # Full pipeline mode (needs Postgres + Redis running):
  python -m tests.benchmark_tmdb --full

  # Customize what to benchmark:
  python -m tests.benchmark_tmdb --movie-id 680 --show-id 1399 --pages 3
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx


def _setup_path():
    src = Path(__file__).resolve().parents[1]
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))


_setup_path()

TMDB_BASE = "https://api.themoviedb.org/3"

DEFAULT_MOVIE_ID = 550   # Fight Club
DEFAULT_SHOW_ID = 1399   # Game of Thrones
DEFAULT_PAGES = 3


def _kb(data: dict | None) -> str:
    import json

    if data is None:
        return "N/A"
    size = len(json.dumps(data, default=str))
    return f"{size} B" if size < 1024 else f"{size / 1024:.1f} KB"


@dataclass
class BenchmarkResult:
    name: str
    duration_s: float
    response_size: str = ""
    item_count: int = 0
    details: dict = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
# Fetch-only client (no DB/Redis dependency)
# ═══════════════════════════════════════════════════════════════════════════════


class TMDBClient:
    """Thin async httpx wrapper for benchmarking raw API calls."""

    def __init__(self, api_key: str, timeout: int = 30):
        self.client = httpx.AsyncClient(
            base_url=TMDB_BASE,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            },
        )

    async def close(self):
        await self.client.aclose()

    async def _get(self, path: str, **params) -> dict:
        resp = await self.client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_movie(self, tmdb_id: int, language: str = "en-US") -> dict:
        return await self._get(
            f"/movie/{tmdb_id}",
            language=language,
            append_to_response="credits,external_ids,images,videos,release_dates",
        )

    async def get_show(self, tmdb_id: int, language: str = "en-US") -> dict:
        return await self._get(
            f"/tv/{tmdb_id}",
            language=language,
            append_to_response="credits,external_ids,images,videos",
        )

    async def get_movie_popular(self, page: int = 1, language: str = "en-US") -> dict:
        return await self._get("/movie/popular", language=language, page=page)

    async def get_show_popular(self, page: int = 1, language: str = "en-US") -> dict:
        return await self._get("/tv/popular", language=language, page=page)


# ═══════════════════════════════════════════════════════════════════════════════
# Benchmarks
# ═══════════════════════════════════════════════════════════════════════════════


async def bench_single_movie(client: TMDBClient, movie_id: int) -> BenchmarkResult:
    t0 = time.monotonic()
    data = await client.get_movie(movie_id)
    elapsed = time.monotonic() - t0

    credits = data.get("credits", {})
    return BenchmarkResult(
        name=f"Single movie (id={movie_id})",
        duration_s=elapsed,
        response_size=_kb(data),
        details={
            "title": data.get("title"),
            "cast_count": len(credits.get("cast", [])),
            "crew_count": len(credits.get("crew", [])),
            "image_count": len(data.get("images", {}).get("posters", [])),
            "has_collection": bool(data.get("belongs_to_collection")),
        },
    )


async def bench_single_show(client: TMDBClient, show_id: int) -> BenchmarkResult:
    t0 = time.monotonic()
    data = await client.get_show(show_id)
    elapsed = time.monotonic() - t0

    credits = data.get("credits", {})
    return BenchmarkResult(
        name=f"Single show (id={show_id})",
        duration_s=elapsed,
        response_size=_kb(data),
        details={
            "title": data.get("name"),
            "seasons": data.get("number_of_seasons"),
            "episodes": data.get("number_of_episodes"),
            "cast_count": len(credits.get("cast", [])),
            "crew_count": len(credits.get("crew", [])),
        },
    )


async def bench_popular_page(client: TMDBClient, media_type: str, page: int) -> BenchmarkResult:
    t0 = time.monotonic()
    if media_type == "movie":
        data = await client.get_movie_popular(page=page)
    else:
        data = await client.get_show_popular(page=page)
    elapsed = time.monotonic() - t0

    items = data.get("results", [])
    return BenchmarkResult(
        name=f"Popular {media_type}s (page {page})",
        duration_s=elapsed,
        response_size=_kb(data),
        item_count=len(items),
        details={
            "total_pages": data.get("total_pages"),
            "total_results": data.get("total_results"),
            "ids_sample": [r["id"] for r in items[:5]],
        },
    )


async def bench_fanout_discovery(
    client: TMDBClient, media_type: str, pages: int
) -> list[BenchmarkResult]:
    """Fetch N pages of popular items, then individually fetch each item."""
    results: list[BenchmarkResult] = []

    # Phase 1: collect all IDs from discovery pages
    all_ids: list[int] = []
    t0_discovery = time.monotonic()
    for page in range(1, pages + 1):
        data = (
            await client.get_movie_popular(page=page)
            if media_type == "movie"
            else await client.get_show_popular(page=page)
        )
        for item in data.get("results", []):
            all_ids.append(item["id"])
    discovery_elapsed = time.monotonic() - t0_discovery

    results.append(
        BenchmarkResult(
            name=f"Discovery: {pages} pages of popular {media_type}s",
            duration_s=discovery_elapsed,
            item_count=len(all_ids),
            details={"pages": pages, "ids_collected": len(all_ids)},
        )
    )

    # Phase 2: fetch individual items sequentially, measuring each
    individual_times: list[float] = []
    success_count = 0
    fail_count = 0

    t0_individual = time.monotonic()
    for tmdb_id in all_ids:
        t_item = time.monotonic()
        try:
            if media_type == "movie":
                await client.get_movie(tmdb_id)
            else:
                await client.get_show(tmdb_id)
            individual_times.append(time.monotonic() - t_item)
            success_count += 1
        except Exception:
            fail_count += 1
    total_individual = time.monotonic() - t0_individual

    avg_time = sum(individual_times) / len(individual_times) if individual_times else 0
    results.append(
        BenchmarkResult(
            name=f"Individual sync: {success_count} {media_type}s",
            duration_s=total_individual,
            item_count=success_count,
            details={
                "success": success_count,
                "failed": fail_count,
                "avg_per_item_s": f"{avg_time:.3f}",
                "min_s": f"{min(individual_times):.3f}" if individual_times else "N/A",
                "max_s": f"{max(individual_times):.3f}" if individual_times else "N/A",
                "throughput_items_per_s": (
                    f"{success_count / total_individual:.1f}" if total_individual > 0 else "N/A"
                ),
            },
        )
    )

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# Full pipeline benchmark (needs DB + Redis)
# ═══════════════════════════════════════════════════════════════════════════════


async def bench_full_pipeline(movie_id: int, show_id: int) -> list[BenchmarkResult]:
    from sqlalchemy import select

    from otix.domain.media import ExternalID, MediaItem
    from otix.infrastructure.database import async_session
    from otix.infrastructure.redis import get_redis
    from otix.providers.tmdb.client import TMDBProvider
    from otix.providers.tmdb.hydrator import TMDBHydrator
    from otix.providers.tmdb.transformer import to_movie, to_show

    results: list[BenchmarkResult] = []

    redis = await get_redis()
    provider = TMDBProvider(redis)

    # ── Movie pipeline ──────────────────────────────────────────────

    t0 = time.monotonic()

    async with async_session() as session:
        hydrator = TMDBHydrator(provider, session)

        t_fetch = time.monotonic()
        raw = await provider.get_movie(movie_id)
        fetch_time = time.monotonic() - t_fetch

        t_xform = time.monotonic()
        movie = to_movie(raw)
        media_item = movie.media_item
        xform_time = time.monotonic() - t_xform

        t_upsert = time.monotonic()
        existing = await session.scalar(
            select(MediaItem)
            .join(ExternalID)
            .where(
                ExternalID.provider == "tmdb",
                ExternalID.external_id == str(movie_id),
            )
        )
        if existing:
            media_item.id = existing.id
            await session.merge(media_item)
        else:
            session.add(media_item)
            await session.flush()
            session.add(
                ExternalID(provider="tmdb", external_id=str(movie_id), media_item_id=media_item.id)
            )
        session.add(movie)
        upsert_time = time.monotonic() - t_upsert

        t_hydrate = time.monotonic()
        await hydrator.hydrate_genres(media_item, raw)
        await hydrator.hydrate_credits(media_item, raw)
        await hydrator.hydrate_images(media_item, raw)
        await hydrator.hydrate_ratings(media_item, raw)
        await hydrator.hydrate_external_ids(media_item, raw)
        await hydrator.hydrate_collection(movie, raw)
        hydrate_time = time.monotonic() - t_hydrate

        t_commit = time.monotonic()
        await session.commit()
        commit_time = time.monotonic() - t_commit

    total = time.monotonic() - t0

    credits_raw = raw.get("credits", {})
    results.append(
        BenchmarkResult(
            name=f"Full pipeline: movie {movie_id} ({raw.get('title', '?')})",
            duration_s=total,
            response_size=_kb(raw),
            details={
                "fetch": f"{fetch_time:.3f}s",
                "transform": f"{xform_time:.3f}s",
                "upsert": f"{upsert_time:.3f}s",
                "hydrate": f"{hydrate_time:.3f}s",
                "commit": f"{commit_time:.3f}s",
                "total": f"{total:.3f}s",
                "cast": len(credits_raw.get("cast", [])),
                "crew": len(credits_raw.get("crew", [])),
                "posters": len(raw.get("images", {}).get("posters", [])),
            },
        )
    )

    # ── Show pipeline ───────────────────────────────────────────────

    t0 = time.monotonic()

    async with async_session() as session:
        hydrator = TMDBHydrator(provider, session)

        t_fetch = time.monotonic()
        raw = await provider.get_show(show_id)
        fetch_time = time.monotonic() - t_fetch

        t_xform = time.monotonic()
        show = to_show(raw)
        media_item = show.media_item
        xform_time = time.monotonic() - t_xform

        t_upsert = time.monotonic()
        existing = await session.scalar(
            select(MediaItem)
            .join(ExternalID)
            .where(
                ExternalID.provider == "tmdb",
                ExternalID.external_id == str(show_id),
            )
        )
        if existing:
            media_item.id = existing.id
            await session.merge(media_item)
        else:
            session.add(media_item)
            await session.flush()
            session.add(
                ExternalID(provider="tmdb", external_id=str(show_id), media_item_id=media_item.id)
            )
        session.add(show)
        upsert_time = time.monotonic() - t_upsert

        t_hydrate = time.monotonic()
        await hydrator.hydrate_genres(media_item, raw)
        await hydrator.hydrate_credits(media_item, raw)
        await hydrator.hydrate_images(media_item, raw)
        await hydrator.hydrate_ratings(media_item, raw)
        await hydrator.hydrate_external_ids(media_item, raw)
        hydrate_time = time.monotonic() - t_hydrate

        t_commit = time.monotonic()
        await session.commit()
        commit_time = time.monotonic() - t_commit

    total = time.monotonic() - t0

    results.append(
        BenchmarkResult(
            name=f"Full pipeline: show {show_id} ({raw.get('name', '?')})",
            duration_s=total,
            response_size=_kb(raw),
            details={
                "fetch": f"{fetch_time:.3f}s",
                "transform": f"{xform_time:.3f}s",
                "upsert": f"{upsert_time:.3f}s",
                "hydrate": f"{hydrate_time:.3f}s",
                "commit": f"{commit_time:.3f}s",
                "total": f"{total:.3f}s",
                "seasons": raw.get("number_of_seasons"),
                "episodes": raw.get("number_of_episodes"),
            },
        )
    )

    await provider.http.aclose()
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# Report
# ═══════════════════════════════════════════════════════════════════════════════


def print_report(results: list[BenchmarkResult], *, full_pipeline: bool = False):
    print()
    print("=" * 72)
    print(f"  TMDB Benchmark Report  {'(full pipeline)' if full_pipeline else '(fetch-only)'}")
    print("=" * 72)
    print()

    for r in results:
        print(f"  {r.name}")
        print(f"    Duration:      {r.duration_s:.3f}s")
        if r.response_size:
            print(f"    Response size: {r.response_size}")
        if r.item_count:
            print(f"    Items:         {r.item_count}")
        for key, val in r.details.items():
            print(f"    {key.replace('_', ' ').title()}:  {val}")
        print()

    total_time = sum(r.duration_s for r in results)
    print("-" * 72)
    print(f"  Total measured time: {total_time:.3f}s")
    print(f"  Result count:        {len(results)}")
    print("=" * 72)
    print()


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════


def _load_api_key() -> str:
    import os

    token = os.getenv("TMDB_RAT") or os.getenv("tmdb_rat")
    if token:
        return token

    env_file = Path(__file__).resolve().parents[1] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == "TMDB_RAT":
                return value.strip().strip('"').strip("'")

    print("ERROR: TMDB_RAT not set in environment or .env file")
    print("Set the TMDB v4 read-access token as TMDB_RAT=<your-token>")
    sys.exit(1)


async def main():
    parser = argparse.ArgumentParser(description="TMDB provider benchmark")
    parser.add_argument("--movie-id", type=int, default=DEFAULT_MOVIE_ID)
    parser.add_argument("--show-id", type=int, default=DEFAULT_SHOW_ID)
    parser.add_argument("--pages", type=int, default=DEFAULT_PAGES)
    parser.add_argument("--full", action="store_true", help="Run full pipeline (needs DB + Redis)")
    parser.add_argument("--skip-fanout", action="store_true", help="Skip the fan-out batch test")
    args = parser.parse_args()

    api_key = _load_api_key()
    results: list[BenchmarkResult] = []

    client = TMDBClient(api_key)
    try:
        print("\nWarming up with /configuration ...")
        t0 = time.monotonic()
        await client._get("/configuration")
        print(f"  Connected in {time.monotonic() - t0:.3f}s")

        print(f"\nBenchmarking single movie (id={args.movie_id})...")
        results.append(await bench_single_movie(client, args.movie_id))

        print(f"Benchmarking single show (id={args.show_id})...")
        results.append(await bench_single_show(client, args.show_id))

        for p in range(1, args.pages + 1):
            print(f"Benchmarking popular movies page {p}...")
            results.append(await bench_popular_page(client, "movie", p))

        for p in range(1, args.pages + 1):
            print(f"Benchmarking popular shows page {p}...")
            results.append(await bench_popular_page(client, "show", p))

        if not args.skip_fanout:
            print(f"\nBenchmarking fan-out: {args.pages} page(s) -> individual movie syncs...")
            results.extend(await bench_fanout_discovery(client, "movie", args.pages))

    finally:
        await client.close()

    if args.full:
        print("\nRunning full pipeline (needs Postgres + Redis)...")
        try:
            results.extend(await bench_full_pipeline(args.movie_id, args.show_id))
        except Exception as exc:
            print(f"  Full pipeline failed: {exc}")
            print("  Run: docker compose up -d db redis")

    print_report(results, full_pipeline=args.full)


if __name__ == "__main__":
    asyncio.run(main())
