"""Last.fm enrichment: wiki summaries, tags, playcounts as external ratings."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album
from otix.domain.genre import Genre, MediaGenre
from otix.domain.asset import ExternalRating
from otix.lib.types import JSONValue
from otix.providers.lastfm.client import LastFMProvider
from otix.providers.lastfm.transformer import (
    extract_wiki_summary,
    extract_tags,
    extract_playcount,
    extract_listeners,
)


class LastFMHydrator:
    def __init__(self, provider: LastFMProvider, session: AsyncSession):
        self._provider = provider
        self._session = session

    async def hydrate_album(self, album: Album, artist_name: str, album_name: str) -> None:
        """Enrich an album from Last.fm: wiki, tags, playcounts."""
        try:
            lfm_album = await self._provider.album_get_info(
                artist=artist_name, album=album_name, mbid=album.musicbrainz_id
            )
        except Exception:
            return

        if not lfm_album:
            return

        # Wiki summary
        wiki = extract_wiki_summary(lfm_album)
        if wiki and not album.media_item.overview:
            album.media_item.overview = wiki

        # Tags → Genres
        tags = extract_tags(lfm_album)
        for tag in tags[:6]:
            await self._add_genre(album, tag)

        # Playcount as external rating
        playcount = extract_playcount(lfm_album)
        if playcount:
            await self._upsert_rating(album, "lastfm", float(playcount))

        listeners = extract_listeners(lfm_album)
        if listeners:
            await self._upsert_rating(album, "lastfm_listeners", float(listeners))

    async def hydrate_artist(self, artist_name: str, artist_mbid: str | None = None) -> None:
        """Fetch artist info from Last.fm and update Person record if found."""
        try:
            lfm_artist = await self._provider.artist_get_info(
                artist=artist_name, mbid=artist_mbid
            )
        except Exception:
            return

        if not lfm_artist:
            return

        from otix.domain.people import Person

        if artist_mbid:
            person = await self._session.scalar(
                select(Person).where(Person.musicbrainz_artist_id == artist_mbid)
            )
        else:
            person = await self._session.scalar(
                select(Person).where(Person.name == artist_name)
            )

        if not person:
            return

        # Enrich biography from Last.fm wiki
        bio_data = lfm_artist.get("bio", {}) if isinstance(lfm_artist.get("bio"), dict) else {}
        bio_summary = bio_data.get("summary")
        if bio_summary and not person.biography:
            person.biography = bio_summary.split("<a href=")[0].strip()

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _add_genre(self, album: Album, name: str) -> None:
        slug = name.lower().replace(" ", "-")
        genre = await self._session.scalar(select(Genre).where(Genre.slug == slug))
        if genre is None:
            genre = Genre(name=name, slug=slug)
            self._session.add(genre)
            await self._session.flush()

        exists = await self._session.scalar(
            select(MediaGenre).where(
                MediaGenre.media_item_id == album.media_item_id,
                MediaGenre.genre_id == genre.id,
            )
        )
        if not exists:
            self._session.add(MediaGenre(
                media_item_id=album.media_item_id,
                genre_id=genre.id,
            ))

    async def _upsert_rating(self, album: Album, provider: str, score: float) -> None:
        existing = await self._session.scalar(
            select(ExternalRating).where(
                ExternalRating.media_item_id == album.media_item_id,
                ExternalRating.provider == provider,
            )
        )
        if existing:
            existing.score = score
        else:
            self._session.add(ExternalRating(
                media_item_id=album.media_item_id,
                provider=provider,
                score=score,
                max_score=1000000 if provider == "lastfm" else 100000,
            ))
