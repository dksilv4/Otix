"""Manual music artwork hydration — runs synchronously without Celery.

Fetches album artwork from Spotify and Fanart.tv for music items missing
poster_url. Tries Spotify first (faster, more reliable), falls back to
Fanart.tv for items that still lack artwork.

Usage:
    uv run python -m otix.scripts.hydrate_music_artwork [limit]
"""

import asyncio
import sys
from datetime import datetime, timezone

from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.domain.media import Album, MediaItem
from otix.domain.people import MediaCredit, Person

from sqlalchemy import select, and_


async def hydrate_batch(limit: int = 50) -> dict:
    redis = await get_redis()

    async with async_session() as session:
        # Find music items without poster_url that have a primary artist MBID
        result = await session.execute(
            select(MediaItem.id, MediaItem.title, Album.spotify_id, Person.musicbrainz_artist_id)
            .join(Album, Album.media_item_id == MediaItem.id)
            .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(
                MediaItem.media_type == "music",
                MediaItem.poster_url.is_(None),
                MediaCredit.role == "primary",
                Person.musicbrainz_artist_id.isnot(None),
            )
            .order_by(MediaItem.release_date.desc().nulls_last())
            .limit(limit)
        )
        rows = result.all()

    spotify_matched = 0
    spotify_hydrated = 0
    fanart_hydrated = 0

    for otix_id, title, spotify_id, artist_mbid in rows:
        has_poster = False

        # ── Step 1: Spotify match + enrich ──────────────────────────
        async with async_session() as session:
            album = await session.get(Album, otix_id)
            if album is None:
                continue

            # Match if needed
            if not album.spotify_id:
                from otix.providers.spotify.client import SpotifyProvider
                sp = SpotifyProvider(redis)
                try:
                    results = await sp.search(album.media_item.title, "album", limit=3)
                    if results and results[0].get("id"):
                        album.spotify_id = results[0]["id"]
                        spotify_matched += 1
                except Exception:
                    pass

            # Enrich from Spotify
            if album.spotify_id:
                from otix.providers.spotify.hydrator import SpotifyHydrator
                sp = SpotifyProvider(redis)
                hydrator = SpotifyHydrator(sp, session)
                try:
                    await hydrator.hydrate(album)
                    await session.commit()
                    if album.media_item.poster_url:
                        spotify_hydrated += 1
                        has_poster = True
                except Exception:
                    await session.rollback()

        # ── Step 2: Fanart.tv fallback ───────────────────────────────
        if not has_poster:
            async with async_session() as session:
                media_item = await session.get(MediaItem, otix_id)
                if media_item is None or media_item.poster_url:
                    continue

                from otix.providers.fanart.client import FanartProvider
                from otix.providers.fanart.hydrator import FanartHydrator
                fa = FanartProvider(redis)
                fanart_hyd = FanartHydrator(fa, session)
                try:
                    added = await fanart_hyd.hydrate_music_images(media_item)
                    await session.commit()
                    if added:
                        fanart_hydrated += 1
                except Exception:
                    await session.rollback()

        # Progress
        done = spotify_hydrated + fanart_hydrated
        if done % 10 == 0 and done > 0:
            print(f"  {done}/{limit} hydrated...")

    return {
        "total": len(rows),
        "spotify_matched": spotify_matched,
        "spotify_hydrated": spotify_hydrated,
        "fanart_hydrated": fanart_hydrated,
    }


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    print(f"Hydrating up to {limit} music albums...")
    result = asyncio.run(hydrate_batch(limit))
    print(f"Done. total={result['total']} spotify_matched={result['spotify_matched']} "
          f"spotify_hydrated={result['spotify_hydrated']} fanart_hydrated={result['fanart_hydrated']}")


if __name__ == "__main__":
    main()
