"""Wipe all music-related data from the database.

Deletes only media_type='music' rows and their cascaded children.
Safe to run while the app is running — uses a single transaction.

Usage:
    docker compose run --rm worker-slow python -m otix.scripts.wipe_music
"""

import asyncio
import sys

from sqlalchemy import text

from otix.infrastructure.database import async_session


async def wipe_music() -> dict:
    async with async_session() as session:
        # Count before
        result = await session.execute(
            text("SELECT COUNT(*) FROM media_items WHERE media_type = 'music'")
        )
        before_media = result.scalar()

        result = await session.execute(
            text("SELECT COUNT(*) FROM albums")
        )
        before_albums = result.scalar()

        result = await session.execute(
            text("SELECT COUNT(*) FROM tracks")
        )
        before_tracks = result.scalar()

        result = await session.execute(
            text("SELECT COUNT(*) FROM media_credits mc "
                 "JOIN media_items mi ON mi.id = mc.media_item_id "
                 "WHERE mi.media_type = 'music'")
        )
        before_credits = result.scalar()

        result = await session.execute(
            text("SELECT COUNT(*) FROM external_ids ei "
                 "JOIN media_items mi ON mi.id = ei.media_item_id "
                 "WHERE mi.media_type = 'music'")
        )
        before_ext = result.scalar()

        result = await session.execute(
            text("SELECT COUNT(*) FROM media_assets ma "
                 "JOIN media_items mi ON mi.id = ma.media_item_id "
                 "WHERE mi.media_type = 'music'")
        )
        before_assets = result.scalar()

        if before_media == 0:
            print("No music data to wipe.")
            return {"wiped": 0}

        print(f"Wiping: {before_media} media_items, {before_albums} albums, "
              f"{before_tracks} tracks, {before_credits} credits, "
              f"{before_ext} external_ids, {before_assets} assets")

        # Delete media_items (cascades to albums, tracks, media_credits,
        # external_ids, media_assets, collection_items, reviews, etc.)
        result = await session.execute(
            text("DELETE FROM media_items WHERE media_type = 'music'")
        )
        deleted = result.rowcount

        # Also clean now-orphaned people (artists with no remaining credits)
        result = await session.execute(
            text("DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM media_credits)")
        )
        orphaned_people = result.rowcount

        await session.commit()
        print(f"Wiped {deleted} media_items + {orphaned_people} orphaned artists.")
        return {"wiped": deleted, "orphaned_artists": orphaned_people}


def main() -> None:
    if "--yes" not in sys.argv:
        print("This will DELETE ALL music data. Run with --yes to confirm.")
        sys.exit(1)
    result = asyncio.run(wipe_music())
    print(f"Done: {result}")


if __name__ == "__main__":
    main()
