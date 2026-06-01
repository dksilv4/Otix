"""LRCLIB lyrics enrichment for album tracks."""

from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, Track
from otix.domain.people import MediaCredit, Person
from otix.providers.lrclib.client import LRCLIBProvider


class LRCLIBHydrator:
    def __init__(self, provider: LRCLIBProvider, session: AsyncSession):
        self._provider = provider
        self._session = session

    async def hydrate_album(self, album: Album) -> int:
        """Fetch lyrics for all tracks on an album that don't already have lyrics.

        Returns the number of tracks enriched.
        """
        artist_name = await self._get_primary_artist(album.media_item_id)

        track_query = select(Track).where(
            Track.album_id == album.media_item_id,
            Track.lyrics.is_(None),
        )
        result = await self._session.execute(track_query)
        tracks_needing_lyrics = list(result.scalars().all())

        enriched = 0
        for track in tracks_needing_lyrics:
            try:
                lrc = await self._provider.get_lyrics(
                    track_name=track.title,
                    artist_name=artist_name or "",
                    album_name=album.media_item.title,
                    duration=track.duration_ms,
                )
            except Exception:
                continue

            if not lrc:
                continue

            lyrics_text = lrc.get("plainLyrics")
            if not isinstance(lyrics_text, str) or not lyrics_text.strip():
                continue

            # Update via ORM to keep session consistent
            track.lyrics = lyrics_text.strip()
            enriched += 1

        if enriched:
            await self._session.flush()

        return enriched

    async def _get_primary_artist(self, media_item_id: str) -> str | None:
        result = await self._session.execute(
            select(Person.name)
            .join(MediaCredit, MediaCredit.person_id == Person.id)
            .where(MediaCredit.media_item_id == media_item_id, MediaCredit.role == "primary")
        )
        return result.scalar()
