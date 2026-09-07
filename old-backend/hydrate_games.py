"""One-off backfill: fetch SteamGridDB artwork for games missing a logo.

Runs the shared SteamGridDBHydrator across the most popular games that lack a
logo_url. Reuses a single hydrator/session, respects provider cooldowns, and
falls back to name search (via the game title) when no store-platform ID is
known.
"""

import argparse
import asyncio

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from otix.domain.media import Game, MediaItem
from otix.infrastructure.database import async_session
from otix.providers.steamgrid.client import SteamGridDBProvider
from otix.providers.steamgrid.hydrator import SteamGridDBHydrator

REDIS_URL = "redis://redis:6379/0"


async def main(limit: int = 100) -> None:
    redis_client = Redis.from_url(REDIS_URL, decode_responses=False)
    provider = SteamGridDBProvider(redis_client)

    async with async_session() as s:
        stmt = (
            select(Game)
            .join(MediaItem)
            .options(joinedload(Game.media_item))
            .where(
                MediaItem.media_type == "game",
                MediaItem.logo_url.is_(None),
                MediaItem.popularity > 0,
            )
            .order_by(MediaItem.popularity.desc())
            .limit(limit)
        )

        games = (await s.execute(stmt)).scalars().all()
        total = len(games)
        ok = fail = skipped = 0
        hydrator = SteamGridDBHydrator(provider, s)

        for game in games:
            # Back off if SteamGridDB is currently rate limited instead of
            # hammering the API.
            cooldown = await SteamGridDBProvider.check_cooldown(redis_client, "steamgrid")
            if cooldown:
                print(f"steamgrid rate-limited; sleeping {cooldown}s")
                await asyncio.sleep(cooldown + 1)

            title = game.media_item.title if game.media_item else None
            if not title:
                skipped += 1
                continue

            try:
                added = await hydrator.hydrate(game, title=title)
                await s.commit()
                if added:
                    ok += 1
                else:
                    skipped += 1
            except Exception as exc:
                await s.rollback()
                fail += 1
                print(f"  error hydrating {title!r}: {exc}")

            done = ok + skipped + fail
            if done % 25 == 0 or done == total:
                print(f"[{done}/{total}] hydrated={ok}, skipped={skipped}, failed={fail}")

        total_with_logo = (await s.execute(
            select(func.count())
            .select_from(MediaItem)
            .where(MediaItem.media_type == "game", MediaItem.logo_url.is_not(None))
        )).scalar_one()
        total_games = (await s.execute(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "game")
        )).scalar_one()
        print(f"Done: {ok} hydrated. Games with logos now: {total_with_logo}/{total_games}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill SteamGridDB artwork for games missing logos"
    )
    parser.add_argument("--limit", type=int, default=100, help="Max games to process")
    args = parser.parse_args()
    asyncio.run(main(limit=args.limit))
