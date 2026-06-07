import asyncio

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from otix.domain.media import Game, MediaItem
from otix.infrastructure.database import async_session
from otix.providers.steamgrid.client import SteamGridDBProvider
from otix.providers.steamgrid.hydrator import SteamGridDBHydrator


async def main():
    redis_client = Redis.from_url("redis://redis:6379/0", decode_responses=False)
    provider = SteamGridDBProvider(redis_client)

    async with async_session() as s:
        stmt = (select(Game)
            .join(MediaItem)
            .options(joinedload(Game.media_item))
            .where(
                MediaItem.media_type == 'game',
                MediaItem.logo_url.is_(None),
                MediaItem.popularity > 0,
            )
            .order_by(MediaItem.popularity.desc())
            .limit(100))

        result = await s.execute(stmt)
        games = result.scalars().all()
        total = len(games)
        ok = fail = 0

        for _i, game in enumerate(games):
            try:
                hydrator = SteamGridDBHydrator(provider, s)
                await hydrator.hydrate(game)
                await s.commit()
                ok += 1
                if ok % 25 == 0 or ok == total:
                    print(f"[{ok}/{total}] hydrated, {fail} failed")
            except Exception:
                await s.rollback()
                fail += 1

        # Final stats
        r = await s.execute(select(MediaItem).where(
            MediaItem.media_type == 'game',
            MediaItem.logo_url.is_not(None),
        ))
        total_with_logo = len(r.scalars().all())
        r2 = await s.execute(select(MediaItem).where(MediaItem.media_type == 'game'))
        total_games = len(r2.scalars().all())
        print(f"Done: {ok} hydrated. Games with logos now: {total_with_logo}/{total_games}")

asyncio.run(main())
