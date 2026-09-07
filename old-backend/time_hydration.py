"""One-off timing harness: fully process a single movie/show/game and report.

Runs the real ``sync.media.fully_process`` pipeline inline (primary sync +
all enrichment + embedding + completeness) against the live DB/Redis and
prints the total wall time plus a per-stage breakdown. Used to calibrate the
curated top-N seed size.

Usage:
    .venv/bin/python time_hydration.py            # defaults: Matrix / Breaking Bad / Witcher 3
    .venv/bin/python time_hydration.py --movie 603 --show 1396 --game-search "Portal 2"
"""

import argparse
import asyncio
import json
import time

from otix.tasks.sync.fully_process import _fully_process


async def time_one(media_type: str, external_id: int | str, force: bool = True) -> dict:
    start = time.monotonic()
    result = await _fully_process(media_type, external_id, force=force, task=None)
    total = time.monotonic() - start
    return {"media_type": media_type, "external_id": external_id, "total": total, "result": result}


async def discover_game_id(search: str) -> int | None:
    from otix.infrastructure.redis import get_redis
    from otix.providers.igdb.client import IGDBProvider

    redis = await get_redis()
    provider = IGDBProvider(redis)
    results = await provider.search_games(search, limit=5, fields="id,name")
    for r in results:
        if r.get("id"):
            print(f"  game match: id={r['id']} name={r.get('name')!r}")
            return int(r["id"])
    return None


async def main(args) -> None:
    runs = []

    if args.movie:
        runs.append(await time_one("movie", int(args.movie)))
    if args.show:
        runs.append(await time_one("show", int(args.show)))
    if args.game or args.game_search:
        game_id = int(args.game) if args.game else await discover_game_id(args.game_search)
        if game_id:
            runs.append(await time_one("game", game_id))
        else:
            print("  no IGDB game matched; skipping game timing")

    print("\n" + "=" * 80)
    for r in runs:
        result = r["result"]
        label = f"{r['media_type']} #{r['external_id']}"
        if result is None:
            print(f"{label:<22} {r['total']:7.1f}s  (no result — skipped)")
            continue
        title = result.get("title") or "?"
        stages = result.get("stages") or {}
        total = r["total"]
        stage_total = sum(stages.values())
        print(f"{label:<22} {total:7.1f}s  {title!r}  status={result.get('status')}")
        for stage, secs in sorted(stages.items(), key=lambda kv: kv[1], reverse=True):
            print(f"    {stage:<14} {secs:7.1f}s  ({secs / total * 100:4.1f}%)")
        print(f"    {'UNACCOUNTED':<14} {max(total - stage_total, 0):7.1f}s")
    print("=" * 80)

    summary = [
        {
            "media_type": r["media_type"],
            "external_id": r["external_id"],
            "total_seconds": round(r["total"], 2),
            "title": (r["result"] or {}).get("title"),
            "stages": {k: round(v, 2) for k, v in ((r["result"] or {}).get("stages") or {}).items()},
        }
        for r in runs
    ]
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--movie", default="603", help="TMDB movie ID to time (default: The Matrix)")
    parser.add_argument("--show", default="1396", help="TMDB show ID to time (default: Breaking Bad)")
    parser.add_argument("--game", help="IGDB game ID to time")
    parser.add_argument("--game-search", default="The Witcher 3", help="IGDB search query for game timing")
    args = parser.parse_args()
    asyncio.run(main(args))
