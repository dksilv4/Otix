"""Debug set_show_watched for Pluribus."""
import asyncio
from datetime import date
from sqlalchemy import select, or_, text as sql_text
from otix.infrastructure.config import settings
from otix.infrastructure.database import _session_factory as create_session_factory
from otix.domain.media import Episode, Season


async def main():
    sf = create_session_factory(settings.database_url)
    async with sf() as s:
        show_id = "oti_523033c8a2f9"
        today = date.today()
        print(f"Today: {today}")

        # Simulate what set_show_watched does
        result = await s.execute(
            select(Episode.id, Episode.episode_number, Episode.name, Episode.air_date, Season.season_number)
            .join(Season, Season.id == Episode.season_id)
            .where(
                Season.show_id == show_id,
                Season.season_number > 0,
                or_(Episode.air_date == None, Episode.air_date <= today),
            )
            .order_by(Season.season_number, Episode.episode_number)
        )
        episodes = result.all()
        print(f"Found {len(episodes)} released non-special episodes:")
        for ep in episodes:
            print(f"  S{ep.season_number} Ep{ep.episode_number}: {ep.name} (air_date={ep.air_date})")

        # Also check what all non-special episodes are (without air_date filter)
        result2 = await s.execute(
            select(Episode.id, Episode.episode_number, Episode.name, Episode.air_date, Season.season_number)
            .join(Season, Season.id == Episode.season_id)
            .where(
                Season.show_id == show_id,
                Season.season_number > 0,
            )
            .order_by(Season.season_number, Episode.episode_number)
        )
        all_eps = result2.all()
        print(f"\nTotal non-special episodes (incl future): {len(all_eps)}")
        for ep in all_eps:
            print(f"  S{ep.season_number} Ep{ep.episode_number}: {ep.name} (air_date={ep.air_date})")

        # Check for specials (season 0)
        result3 = await s.execute(
            select(Episode.id, Episode.episode_number, Episode.name, Episode.air_date, Season.season_number)
            .join(Season, Season.id == Episode.season_id)
            .where(
                Season.show_id == show_id,
                Season.season_number == 0,
            )
            .order_by(Episode.episode_number)
        )
        specials = result3.all()
        print(f"\nSpecials (season 0): {len(specials)}")
        for ep in specials:
            print(f"  S{ep.season_number} Ep{ep.episode_number}: {ep.name} (air_date={ep.air_date})")


asyncio.run(main())
