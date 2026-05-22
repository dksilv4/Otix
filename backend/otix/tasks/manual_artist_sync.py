"""Manual artist sync — in-process MusicBrainz + Last.fm + Fanart sync for an artist.

No Celery workers, no Spotify. Runs directly in-process.

Usage (inside API container):
    python -m otix.tasks.manual_artist_sync "Michael Jackson"
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import func, select

from otix.domain.media import Album, MediaItem
from otix.domain.people import MediaCredit, Person
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.providers.musicbrainz.client import MusicBrainzProvider
from otix.tasks.sync.fanart import _sync_fanart_enrich
from otix.tasks.sync.lastfm import _sync_lastfm_enrich_album
from otix.tasks.sync.musicbrainz import _sync_musicbrainz_album


async def sync_artist(artist_name: str) -> int:
    """Full in-process sync: find artist on MusicBrainz, seed/sync all releases,
    then enrich with Last.fm and Fanart."""

    redis = await get_redis()
    mb_provider = MusicBrainzProvider(redis)

    # ── Step 1: Find the artist on MusicBrainz ──────────────────────────
    print(f"Searching MusicBrainz for: {artist_name}")
    results = await mb_provider.search_artist(artist_name, limit=5)
    if not results:
        print("Artist not found on MusicBrainz.")
        return 0

    artist_mbid = results[0].get("id")
    artist_name_mb = results[0].get("name", artist_name)
    print(f"Found: {artist_name_mb} (mbid={artist_mbid})")

    # ── Step 2: Find or create Person record ─────────────────────────────
    async with async_session() as session:
        person = await session.scalar(
            select(Person).where(Person.name.ilike(artist_name_mb))
        )
        if person is None:
            person = await session.scalar(
                select(Person).where(Person.musicbrainz_artist_id == artist_mbid)
            )
        if person is None:
            person = Person(name=artist_name_mb, musicbrainz_artist_id=artist_mbid)
            session.add(person)
            await session.flush()
            print(f"Created Person: {person.name} (id={person.id})")
        else:
            was_updated = False
            if not person.musicbrainz_artist_id:
                person.musicbrainz_artist_id = artist_mbid
                was_updated = True
            if person.name != artist_name_mb:
                person.name = artist_name_mb
                was_updated = True
            if was_updated:
                print(f"Updated Person: {person.name} (id={person.id})")
            else:
                print(f"Found existing Person: {person.name} (id={person.id})")
        await session.commit()
        person_id = person.id

    # ── Step 3: Browse all releases from MusicBrainz ─────────────────────
    print("Browsing MusicBrainz releases...")
    all_releases = []
    offset = 0
    while True:
        releases = await mb_provider.browse_releases_by_artist(artist_mbid, limit=100, offset=offset)
        if not releases:
            break
        all_releases.extend(releases)
        offset += len(releases)
        print(f"  Fetched {len(all_releases)} releases so far...")

    print(f"Total releases: {len(all_releases)}")

    # ── Step 4: Sync each release via MusicBrainz ────────────────────────
    synced = 0
    for i, rel in enumerate(all_releases):
        mbid = rel.get("id")
        title = rel.get("title", "Unknown")
        if not mbid:
            continue
        print(f"  [{i+1}/{len(all_releases)}] {title} (mbid={mbid})")
        try:
            await _sync_musicbrainz_album(mbid, force=True)
            synced += 1
        except Exception as e:
            print(f"    MusicBrainz sync failed: {e}")

    print(f"\nMusicBrainz sync complete: {synced} releases synced.")

    # ── Step 5: Find all Otix albums for this artist ─────────────────────
    async with async_session() as session:
        rows = await session.execute(
            select(MediaItem.id, MediaItem.title, Album.musicbrainz_id, Album.spotify_id)
            .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
            .join(Album, Album.media_item_id == MediaItem.id)
            .where(
                MediaCredit.person_id == person_id,
                MediaItem.media_type == "music",
            )
            .order_by(MediaItem.title)
        )
        albums = rows.all()

    if not albums:
        print("No albums found in catalog for this artist.")
        return synced

    print(f"\nEnriching {len(albums)} albums with Last.fm + Fanart...")

    # ── Step 6: Last.fm + Fanart enrichment ──────────────────────────────
    enriched = 0
    for i, (mid, title, mbid, _) in enumerate(albums):
        print(f"  [{i+1}/{len(albums)}] {title}")
        try:
            await _sync_lastfm_enrich_album(mid)
        except Exception as e:
            print(f"    Last.fm failed: {e}")
        try:
            await _sync_fanart_enrich("music", mid)
        except Exception as e:
            print(f"    Fanart failed: {e}")
        enriched += 1

    print(f"\nDone. {synced} releases synced from MusicBrainz, {enriched} albums enriched.")
    return synced


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    artist_name = " ".join(sys.argv[1:])
    asyncio.run(sync_artist(artist_name))


if __name__ == "__main__":
    main()
