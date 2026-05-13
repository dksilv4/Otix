"""
One-shot backfill: populate episode vote_average from TMDB.
Run inside the API container:

    python3 -m otix.scripts.backfill_episode_ratings
"""
import asyncio
import sys

from otix.infrastructure.database import async_session
from otix.providers.tmdb.client import TMDBProvider
from sqlalchemy import select, update, and_
from sqlalchemy.orm import selectinload
from otix.domain.media import Episode, Season, Show, MediaItem


async def backfill() -> None:
    provider = TMDBProvider()

    async with async_session() as session:
        # Get all shows that have a TMDB external ID
        result = await session.execute(
            select(MediaItem.id, MediaItem.title)
            .where(MediaItem.media_type == "show")
        )
        shows = result.all()
        print(f"Found {len(shows)} shows")

        updated_episodes = 0
        updated_shows = 0

        for show_id, show_title in shows:
            # Find TMDB ID
            from otix.domain.media import ExternalID
            eid_result = await session.execute(
                select(ExternalID.external_id)
                .where(
                    ExternalID.media_item_id == show_id,
                    ExternalID.provider == "tmdb",
                )
            )
            eid_row = eid_result.fetchone()
            if not eid_row:
                continue

            tmdb_id = int(eid_row[0])

            # Get all seasons for this show
            seasons_result = await session.execute(
                select(Season.id, Season.season_number)
                .where(Season.show_id == show_id)
            )
            seasons = seasons_result.all()

            if not seasons:
                continue

            show_updated = False

            for season_id, season_number in seasons:
                if season_number <= 0:
                    continue

                try:
                    season_raw = await provider.get_season(tmdb_id, season_number)
                except Exception:
                    print(f"  FAILED: {show_title} S{season_number}")
                    continue

                for ep_data in season_raw.get("episodes", []):
                    ep_num = ep_data.get("episode_number", 0)
                    vote_avg = ep_data.get("vote_average")

                    if vote_avg is not None:
                        await session.execute(
                            update(Episode)
                            .where(
                                and_(
                                    Episode.season_id == season_id,
                                    Episode.episode_number == ep_num,
                                )
                            )
                            .values(vote_average=vote_avg)
                        )
                        updated_episodes += 1
                        show_updated = True

            if show_updated:
                updated_shows += 1
                print(f"  OK: {show_title} (TMDB {tmdb_id})")
                await session.commit()

            if updated_shows % 10 == 0:
                print(f"Progress: {updated_shows} shows, {updated_episodes} episodes...")

        print(f"\nDone: {updated_shows} shows updated, {updated_episodes} episodes with ratings")


if __name__ == "__main__":
    asyncio.run(backfill())
