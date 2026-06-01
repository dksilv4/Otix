"""Last.fm enrichment: wiki summaries, tags, playcounts as external ratings."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, ExternalID
from otix.domain.genre import Genre, MediaGenre
from otix.domain.asset import ExternalRating
from otix.lib.types import JSONValue
from otix.providers.lastfm.client import LastFMProvider
from otix.services.external_id_service import ExternalIDService
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
            mbid = await self._session.scalar(
                select(ExternalID.external_id).where(
                    ExternalID.entity_id == album.media_item_id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider == "musicbrainz",
                )
            )
            lfm_album = await self._provider.album_get_info(
                artist=artist_name, album=album_name, mbid=mbid
            )
        except Exception:
            return

        if not lfm_album:
            return

        # Wiki summary
        wiki = extract_wiki_summary(lfm_album)
        if wiki and not album.media_item.overview:
            album.media_item.overview = wiki

        # Tags → Genres (batch-check existing genres and links upfront)
        tags = extract_tags(lfm_album)[:6]
        if tags:
            slugs = [t.lower().replace(" ", "-") for t in tags]
            existing_genres = (await self._session.scalars(
                select(Genre).where(Genre.slug.in_(slugs))
            )).all()
            genre_by_slug = {g.slug: g for g in existing_genres}

            existing_links = (await self._session.scalars(
                select(MediaGenre.genre_id).where(
                    MediaGenre.media_item_id == album.media_item_id,
                    MediaGenre.genre_id.in_([g.id for g in existing_genres.values()]),
                )
            )).all()
            existing_genre_ids = set(existing_links)

            for tag in tags:
                slug = tag.lower().replace(" ", "-")
                genre = genre_by_slug.get(slug)
                if genre is None:
                    genre = Genre(name=tag, slug=slug)
                    self._session.add(genre)
                    await self._session.flush()
                    genre_by_slug[slug] = genre

                if genre.id not in existing_genre_ids:
                    self._session.add(MediaGenre(
                        media_item_id=album.media_item_id,
                        genre_id=genre.id,
                    ))

        # Playcount as external rating (batch-check existing ratings)
        existing_ratings = (await self._session.scalars(
            select(ExternalRating)
            .where(
                ExternalRating.media_item_id == album.media_item_id,
                ExternalRating.provider.in_(["lastfm", "lastfm_listeners"]),
            )
        )).all()
        rating_by_provider = {r.provider: r for r in existing_ratings}

        playcount = extract_playcount(lfm_album)
        if playcount:
            self._upsert_rating_inline(album, "lastfm", float(playcount), 1000000, rating_by_provider)

        listeners = extract_listeners(lfm_album)
        if listeners:
            self._upsert_rating_inline(album, "lastfm_listeners", float(listeners), 100000, rating_by_provider)

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
            eid_svc = ExternalIDService(self._session)
            person_id = await eid_svc.find_entity_id_by_type(
                "musicbrainz_artist", artist_mbid, "person"
            )
            person = None
            if person_id:
                person = await self._session.scalar(
                    select(Person).where(Person.id == person_id)
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

    def _upsert_rating_inline(
        self, album: Album, provider: str, score: float, max_score: int,
        existing_by_provider: dict[str, ExternalRating],
    ) -> None:
        existing = existing_by_provider.get(provider)
        if existing:
            existing.score = score
        else:
            self._session.add(ExternalRating(
                media_item_id=album.media_item_id,
                provider=provider,
                score=score,
                max_score=max_score,
            ))
