"""MusicBrainz relation hydration: tracks, artists, labels, genres, cover art."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, MediaItem, Track
from otix.domain.people import Person, MediaCredit
from otix.domain.company import Company, InvolvedCompany
from otix.domain.genre import Genre, MediaGenre
from otix.domain.asset import MediaAsset
from otix.lib.types import JSONValue
from otix.providers.musicbrainz.client import MusicBrainzProvider


class MusicBrainzHydrator:
    def __init__(self, provider: MusicBrainzProvider, session: AsyncSession):
        self._provider = provider
        self._session = session

    async def hydrate_all(self, album: Album, raw: dict[str, JSONValue]) -> None:
        await self.hydrate_tracks(album, raw)
        await self.hydrate_artists(album, raw)
        await self.hydrate_labels(album, raw)
        await self.hydrate_genres(album, raw)
        await self.hydrate_cover_art(album, raw)

    async def hydrate_tracks(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Upsert tracks from MusicBrainz mediums/recordings."""
        # Delete old tracks and re-create (cleanest for mutable tracklists)
        await self._session.execute(
            select(Track).where(Track.album_id == album.media_item_id)
        )
        existing = (await self._session.execute(
            select(Track).where(Track.album_id == album.media_item_id)
        )).scalars().all()
        existing_ids = {t.musicbrainz_recording_id for t in existing if t.musicbrainz_recording_id}

        tracks_to_add = []
        for t in album.tracks:
            if t.musicbrainz_recording_id and t.musicbrainz_recording_id in existing_ids:
                continue  # skip dupes
            t.album_id = album.media_item_id
            tracks_to_add.append(t)

        if tracks_to_add:
            self._session.add_all(tracks_to_add)

    async def hydrate_artists(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Create Person + MediaCredit links from artist-credit data."""
        artist_credits = raw.get("artist-credit", [])
        if not isinstance(artist_credits, list):
            return

        for idx, ac in enumerate(artist_credits):
            artist_data = ac.get("artist")
            if not isinstance(artist_data, dict):
                continue
            mbid = str(artist_data.get("id", "")) if artist_data.get("id") else None
            name = str(artist_data.get("name", ""))

            if not mbid or not name:
                continue

            # Upsert Person via MusicBrainz ID
            person = await self._get_or_create_artist(mbid, name, artist_data)

            # Link to album via MediaCredit
            role = "primary" if idx == 0 else "featured"
            join_str = ac.get("joinphrase", "")
            character_name = f"{name}{join_str}".strip() if join_str else name

            exists = await self._session.scalar(
                select(MediaCredit).where(
                    MediaCredit.media_item_id == album.media_item_id,
                    MediaCredit.person_id == person.id,
                    MediaCredit.role == role,
                )
            )
            if not exists:
                self._session.add(MediaCredit(
                    media_item_id=album.media_item_id,
                    person_id=person.id,
                    role=role,
                    character_name=character_name,
                    sort_order=idx,
                ))

    async def hydrate_labels(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Create Company + InvolvedCompany for the record label."""
        label_infos = raw.get("label-info", [])
        if not isinstance(label_infos, list):
            return

        for li in label_infos:
            label = li.get("label") if isinstance(li, dict) else None
            if not label:
                continue
            name = str(label.get("name", ""))
            if not name:
                continue

            company = await self._get_or_create_label(name)
            catalog_number = li.get("catalog-number")
            if catalog_number and not album.catalog_number:
                album.catalog_number = str(catalog_number)

            exists = await self._session.scalar(
                select(InvolvedCompany).where(
                    InvolvedCompany.media_item_id == album.media_item_id,
                    InvolvedCompany.company_id == company.id,
                )
            )
            if not exists:
                self._session.add(InvolvedCompany(
                    media_item_id=album.media_item_id,
                    company_id=company.id,
                    publisher=True,
                ))

    async def hydrate_genres(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Store genre tags from MusicBrainz."""
        tags = raw.get("tags", [])
        if not isinstance(tags, list):
            return

        for tag in tags[:8]:
            if not isinstance(tag, dict):
                continue
            name = str(tag.get("name", ""))
            if not name:
                continue
            genre = await self._get_or_create_genre(name)

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

    async def hydrate_cover_art(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Fetch cover art from Cover Art Archive and store as MediaAsset."""
        mbid = album.musicbrainz_id
        if not mbid:
            return

        caa = await self._provider.get_cover_art(mbid)
        if not caa:
            return

        images = caa.get("images", [])
        if not isinstance(images, list):
            return

        from sqlalchemy.exc import IntegrityError

        for img in images[:4]:
            if not isinstance(img, dict):
                continue
            url = img.get("image")
            if not url:
                continue

            asset_type = "poster"
            if img.get("back"):
                asset_type = "backdrop"
            elif not img.get("front"):
                continue

            is_thumb = img.get("thumbnails", {}).get("large", "") if isinstance(img.get("thumbnails"), dict) else ""
            img_url = is_thumb or url

            exists = await self._session.scalar(
                select(MediaAsset).where(
                    MediaAsset.media_item_id == album.media_item_id,
                    MediaAsset.url == img_url,
                )
            )
            if exists:
                continue

            try:
                async with self._session.begin_nested():
                    self._session.add(MediaAsset(
                        media_item_id=album.media_item_id,
                        asset_type=asset_type,
                        url=img_url,
                        width=1000,
                        height=1000,
                        provider="musicbrainz",
                    ))
                    await self._session.flush()
            except IntegrityError:
                pass  # another concurrent task already inserted this asset

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get_or_create_artist(self, mbid: str, name: str, raw: dict | None = None) -> Person:
        person = await self._session.scalar(
            select(Person).where(Person.musicbrainz_artist_id == mbid)
        )
        if person is not None:
            return person

        # Use INSERT ... ON CONFLICT DO NOTHING to avoid race conditions
        # between concurrent sync tasks. Then re-query to get the row.
        from uuid import uuid4
        await self._session.execute(
            pg_insert(Person)
            .values(id=f"oti_{uuid4().hex[:12]}", name=name, musicbrainz_artist_id=mbid)
            .on_conflict_do_nothing(constraint="people_musicbrainz_artist_id_key")
        )
        person = await self._session.scalar(
            select(Person).where(Person.musicbrainz_artist_id == mbid)
        )
        return person

    async def _get_or_create_label(self, name: str) -> Company:
        from otix.domain.company import Company as CompanyModel

        slug = name.lower().replace(" ", "-").replace("'", "")
        company = await self._session.scalar(
            select(CompanyModel).where(CompanyModel.slug == slug)
        )
        if company is not None:
            return company

        from uuid import uuid4
        await self._session.execute(
            pg_insert(CompanyModel)
            .values(id=f"oti_{uuid4().hex[:12]}", name=name, slug=slug)
            .on_conflict_do_nothing(constraint="companies_slug_key")
        )
        company = await self._session.scalar(
            select(CompanyModel).where(CompanyModel.slug == slug)
        )
        return company

    async def _get_or_create_genre(self, name: str) -> Genre:
        slug = name.lower().replace(" ", "-")
        genre = await self._session.scalar(select(Genre).where(Genre.slug == slug))
        if genre is not None:
            return genre

        from uuid import uuid4
        await self._session.execute(
            pg_insert(Genre)
            .values(id=f"oti_{uuid4().hex[:12]}", name=name, slug=slug)
            .on_conflict_do_nothing(constraint="genres_slug_key")
        )
        genre = await self._session.scalar(select(Genre).where(Genre.slug == slug))
        return genre
