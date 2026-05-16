"""Manual hydration script — enqueues Fanart enrichment for content missing artwork.

Usage (inside API container):
    python otix/tasks/manual_hydrate.py movies 50   # top 50 movies by popularity
    python otix/tasks/manual_hydrate.py shows 50    # top 50 shows by popularity
    python otix/tasks/manual_hydrate.py movie oti_abc123  # single movie by Otix ID
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import or_, select

from otix.domain.media import ExternalID, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session


async def hydrate_movies(limit: int) -> int:
    async with async_session() as session:
        sub = (
            select(ExternalID.media_item_id)
            .where(ExternalID.provider == "tmdb")
            .subquery()
        )
        rows = await session.execute(
            select(MediaItem.id, MediaItem.title, MediaItem.popularity)
            .where(
                MediaItem.media_type == "movie",
                or_(
                    MediaItem.textless_poster_url.is_(None),
                    MediaItem.logo_url.is_(None),
                ),
                MediaItem.id.in_(select(sub.c.media_item_id)),
            )
            .order_by(MediaItem.popularity.desc().nulls_last())
            .limit(limit)
        )
        movies = rows.all()

    if not movies:
        print("No movies found missing artwork.")
        return 0

    print(f"Enqueuing Fanart enrichment for {len(movies)} movies:")
    for mid, title, pop in movies:
        task = app.send_task("sync.fanart.enrich", args=["movie", mid])
        print(f"  {mid}  {pop:.1f}  {title}  -> {task.id}")

    return len(movies)


async def hydrate_shows(limit: int) -> int:
    async with async_session() as session:
        sub = (
            select(ExternalID.media_item_id)
            .where(ExternalID.provider == "tvdb")
            .subquery()
        )
        rows = await session.execute(
            select(MediaItem.id, MediaItem.title, MediaItem.popularity)
            .where(
                MediaItem.media_type == "show",
                or_(
                    MediaItem.textless_poster_url.is_(None),
                    MediaItem.logo_url.is_(None),
                ),
                MediaItem.id.in_(select(sub.c.media_item_id)),
            )
            .order_by(MediaItem.popularity.desc().nulls_last())
            .limit(limit)
        )
        shows = rows.all()

    if not shows:
        print("No shows found missing artwork.")
        return 0

    print(f"Enqueuing Fanart enrichment for {len(shows)} shows:")
    for mid, title, pop in shows:
        task = app.send_task("sync.fanart.enrich", args=["show", mid])
        print(f"  {mid}  {pop:.1f}  {title}  -> {task.id}")

    return len(shows)


async def hydrate_single_movie(media_item_id: str) -> int:
    app.send_task("sync.fanart.enrich", args=["movie", media_item_id])
    print(f"Enqueued Fanart enrichment for {media_item_id}")
    return 1


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "movies":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        count = asyncio.run(hydrate_movies(limit))
        print(f"\nDone. {count} Fanart tasks enqueued.")

    elif cmd == "shows":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        count = asyncio.run(hydrate_shows(limit))
        print(f"\nDone. {count} Fanart tasks enqueued.")

    elif cmd == "movie":
        if len(sys.argv) < 3:
            print("Usage: python otix/tasks/manual_hydrate.py movie <otix_media_item_id>")
            sys.exit(1)
        asyncio.run(hydrate_single_movie(sys.argv[2]))
        print("\nDone.")

    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
