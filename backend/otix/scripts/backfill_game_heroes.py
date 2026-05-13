"""
One-shot backfill: re-select game hero backdrops from text-safe SteamGridDB heroes.

Run inside the API container:

    python3 -m otix.scripts.backfill_game_heroes --dry-run
    python3 -m otix.scripts.backfill_game_heroes
    python3 -m otix.scripts.backfill_game_heroes --enqueue-rehydration --limit 100
"""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Iterable
from typing import Any

from sqlalchemy import case, select, update

from otix.domain.asset import MediaAsset
from otix.domain.media import Game, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session

_TEXT_SAFE_HERO_STYLES = ("material", "blurred")


def _iter_platform_jobs(
    steam_app_id: int | None,
    store_ids: dict[str, Any] | None,
) -> Iterable[tuple[str, str | int]]:
    """Yield all SteamGridDB platform IDs for a game, with Steam first."""
    if steam_app_id:
        yield ("steam", steam_app_id)

    if not store_ids:
        return

    for platform, platform_id in store_ids.items():
        if platform == "steam" or platform_id in (None, ""):
            continue
        yield (platform, platform_id)


async def promote_existing_clean_heroes(*, dry_run: bool, limit: int | None = None) -> int:
    """Promote the best already-stored text-safe SGDB hero to game backdrop_url."""
    style_rank = case(
        (MediaAsset.style == "material", 0),
        (MediaAsset.style == "blurred", 1),
        else_=2,
    )

    async with async_session() as session:
        result = await session.execute(
            select(
                MediaItem.id,
                MediaItem.title,
                MediaItem.backdrop_url,
                MediaAsset.url,
                MediaAsset.style,
                MediaAsset.score,
            )
            .join(MediaAsset, MediaAsset.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "game",
                MediaAsset.provider == "steamgrid",
                MediaAsset.asset_type == "backdrop",
                MediaAsset.style.in_(_TEXT_SAFE_HERO_STYLES),
            )
            .order_by(
                MediaItem.id,
                style_rank,
                MediaAsset.score.desc().nulls_last(),
            )
        )
        rows = result.all()

        selected: dict[str, tuple[str, str | None, str, str | None, int | None]] = {}
        for item_id, title, current_url, asset_url, style, score in rows:
            if item_id in selected:
                continue
            selected[item_id] = (title, current_url, asset_url, style, score)
            if limit is not None and len(selected) >= limit:
                break

        changed = 0
        for item_id, (title, current_url, asset_url, style, score) in selected.items():
            if current_url == asset_url:
                continue

            changed += 1
            print(f"{'[dry-run] ' if dry_run else ''}promote {item_id} {title!r}: {style} score={score}")
            if not dry_run:
                await session.execute(
                    update(MediaItem)
                    .where(MediaItem.id == item_id)
                    .values(backdrop_url=asset_url)
                )

        if not dry_run:
            await session.commit()

    print(f"Existing clean hero promotion: {changed} changed, {len(selected)} candidates")
    return changed


async def enqueue_steamgrid_rehydration(*, dry_run: bool, limit: int | None = None) -> int:
    """Enqueue SteamGridDB hydration for all games with supported platform IDs."""
    async with async_session() as session:
        result = await session.execute(
            select(MediaItem.id, MediaItem.title, Game.steam_app_id, Game.store_ids)
            .join(Game, Game.media_item_id == MediaItem.id)
            .where(MediaItem.media_type == "game")
            .order_by(MediaItem.popularity.desc().nulls_last())
        )
        games = result.all()

    seen: set[str] = set()
    jobs: list[tuple[str, str | int, str, str]] = []
    for media_item_id, title, steam_app_id, store_ids in games:
        for platform, platform_id in _iter_platform_jobs(steam_app_id, store_ids):
            key = f"{platform}:{platform_id}"
            if key in seen:
                continue
            seen.add(key)
            jobs.append((platform, platform_id, media_item_id, title))
            if limit is not None and len(jobs) >= limit:
                break
        if limit is not None and len(jobs) >= limit:
            break

    for platform, platform_id, media_item_id, title in jobs:
        print(f"{'[dry-run] ' if dry_run else ''}enqueue {platform}:{platform_id} {media_item_id} {title!r}")
        if dry_run:
            continue

        if platform == "steam":
            app.send_task("sync.steamgrid.game", args=[platform_id])
        else:
            app.send_task("sync.steamgrid.game_by_platform", args=[platform, platform_id])

    print(f"SteamGridDB rehydration: {len(jobs)} {'would be ' if dry_run else ''}enqueued")
    return len(jobs)


async def backfill(
    *,
    dry_run: bool,
    limit: int | None,
    select_only: bool,
    enqueue_only: bool,
    enqueue_rehydration: bool,
) -> None:
    if not enqueue_only:
        await promote_existing_clean_heroes(dry_run=dry_run, limit=limit)

    if not select_only and (enqueue_rehydration or enqueue_only):
        await enqueue_steamgrid_rehydration(dry_run=dry_run, limit=limit)
    elif not select_only:
        print("Skipping SteamGridDB rehydration enqueue. Pass --enqueue-rehydration to queue fetch jobs.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--select-only", action="store_true", help="Only promote already-stored clean heroes. This is the default.")
    mode.add_argument("--enqueue-only", action="store_true", help="Only enqueue SteamGridDB rehydration tasks.")
    parser.add_argument(
        "--enqueue-rehydration",
        action="store_true",
        help="Also enqueue SteamGridDB hydration tasks. Use --limit for safe batches.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without updating DB or queue.")
    parser.add_argument("--limit", type=int, default=None, help="Limit promoted items and queued platform jobs.")
    args = parser.parse_args()
    if args.select_only and args.enqueue_rehydration:
        parser.error("--select-only cannot be combined with --enqueue-rehydration")
    return args


def main() -> None:
    args = parse_args()
    asyncio.run(
        backfill(
            dry_run=args.dry_run,
            limit=args.limit,
            select_only=args.select_only,
            enqueue_only=args.enqueue_only,
            enqueue_rehydration=args.enqueue_rehydration,
        )
    )


if __name__ == "__main__":
    main()
