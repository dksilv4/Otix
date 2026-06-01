"""MusicBrainz relation hydration: tracks, artists, labels, genres, cover art."""

from __future__ import annotations

from sqlalchemy import not_, exists as sa_exists, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.domain.media import Album, ExternalID, MediaItem, Track
from otix.domain.people import Person, MediaCredit
from otix.domain.company import Company, InvolvedCompany
from otix.domain.genre import Genre, MediaGenre
from otix.domain.asset import MediaAsset
from otix.lib.types import JSONValue
from otix.providers.musicbrainz.client import MusicBrainzProvider
from otix.services.external_id_service import ExternalIDService


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
        existing = (await self._session.execute(
            select(Track).options(selectinload(Track._external_ids)).where(Track.album_id == album.media_item_id)
        )).scalars().all()
        existing_ids = {t.musicbrainz_recording_id for t in existing if t.musicbrainz_recording_id}

        tracks_to_add = []
        for t in album.tracks:
            if t.musicbrainz_recording_id and t.musicbrainz_recording_id in existing_ids:
                continue
            t.album_id = album.media_item_id
            tracks_to_add.append(t)

        if tracks_to_add:
            self._session.add_all(tracks_to_add)

    async def hydrate_artists(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Create Person + MediaCredit links from artist-credit data."""
        artist_credits = raw.get("artist-credit", [])
        if not isinstance(artist_credits, list):
            return

        # Batch-check existing MediaCredits for this album
        existing_credits = (await self._session.execute(
            select(MediaCredit.person_id, MediaCredit.role)
            .where(MediaCredit.media_item_id == album.media_item_id)
        )).all()
        existing_keys = {(c.person_id, c.role) for c in existing_credits}

        for idx, ac in enumerate(artist_credits):
            artist_data = ac.get("artist")
            if not isinstance(artist_data, dict):
                continue
            mbid = str(artist_data.get("id", "")) if artist_data.get("id") else None
            name = str(artist_data.get("name", ""))

            if not mbid or not name:
                continue

            person = await self._get_or_create_artist(mbid, name, artist_data)

            role = "primary" if idx == 0 else "featured"
            join_str = ac.get("joinphrase", "")
            character_name = f"{name}{join_str}".strip() if join_str else name

            if (person.id, role) in existing_keys:
                continue

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

        # Batch-check existing InvolvedCompany links for this album
        existing_links = (await self._session.execute(
            select(InvolvedCompany.company_id)
            .where(InvolvedCompany.media_item_id == album.media_item_id)
        )).all()
        existing_company_ids = {c.company_id for c in existing_links}

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

            if company.id in existing_company_ids:
                continue

            self._session.add(InvolvedCompany(
                media_item_id=album.media_item_id,
                company_id=company.id,
                publisher=True,
            ))

    async def hydrate_genres(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Store genre tags from MusicBrainz."""
        tags = raw.get("genres", [])
        if not isinstance(tags, list):
            return

        # Batch-check existing genre links for this album
        existing_genres = (await self._session.execute(
            select(MediaGenre.genre_id)
            .where(MediaGenre.media_item_id == album.media_item_id)
        )).all()
        existing_genre_ids = {g.genre_id for g in existing_genres}

        for tag in tags[:8]:
            if not isinstance(tag, dict):
                continue
            name = str(tag.get("name", ""))
            if not name:
                continue
            genre = await self._get_or_create_genre(name)

            if genre.id in existing_genre_ids:
                continue

            self._session.add(MediaGenre(
                media_item_id=album.media_item_id,
                genre_id=genre.id,
            ))

    async def hydrate_cover_art(self, album: Album, raw: dict[str, JSONValue]) -> None:
        """Fetch cover art from Cover Art Archive and store as MediaAsset."""
        mbid_row = await self._session.scalar(
            select(ExternalID.external_id).where(
                ExternalID.entity_id == album.media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider == "musicbrainz",
            )
        )
        if not mbid_row:
            return
        mbid = mbid_row

        caa = await self._provider.get_cover_art(mbid)
        if not caa:
            return

        images = caa.get("images", [])
        if not isinstance(images, list):
            return

        # Resolve image URLs to check
        candidates: list[tuple[str, str, int, int]] = []  # (url, asset_type, width, height)
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
            candidates.append((img_url, asset_type, 1000, 1000))

        if not candidates:
            return

        # Batch-check existing URLs for this album
        candidate_urls = [c[0] for c in candidates]
        existing = (await self._session.execute(
            select(MediaAsset.url).where(
                MediaAsset.media_item_id == album.media_item_id,
                MediaAsset.url.in_(candidate_urls),
            )
        )).all()
        existing_urls = {e.url for e in existing}

        from sqlalchemy.exc import IntegrityError

        for img_url, asset_type, width, height in candidates:
            if img_url in existing_urls:
                continue

            try:
                async with self._session.begin_nested():
                    self._session.add(MediaAsset(
                        media_item_id=album.media_item_id,
                        asset_type=asset_type,
                        url=img_url,
                        width=width,
                        height=height,
                        provider="musicbrainz",
                    ))
                    await self._session.flush()
            except IntegrityError:
                pass

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get_or_create_artist(self, mbid: str, name: str, raw: dict | None = None) -> Person:
        from uuid import uuid4
        from sqlalchemy import func as sa_func

        from otix.providers.musicbrainz.transformer import extract_wikidata_id

        eid_svc = ExternalIDService(self._session)
        person_id = await eid_svc.find_entity_id_by_type(
            "musicbrainz_artist", mbid, "person"
        )
        person = None
        if person_id:
            person = await self._session.scalar(
                select(Person).options(selectinload(Person._external_ids)).where(Person.id == person_id)
            )
        if person is not None:
            # Backfill wikidata_id if we now have it and the record doesn't
            if raw:
                relations = raw.get("relations")
                wiki_id = extract_wikidata_id(relations if isinstance(relations, list) else None)
                if wiki_id and not person.wikidata_id:
                    person.wikidata_id = wiki_id
            return person

        # Check wikidata_id for cross-provider match (e.g., TMDB already has this person)
        if raw:
            relations = raw.get("relations")
            wiki_id = extract_wikidata_id(relations if isinstance(relations, list) else None)
            if wiki_id:
                existing_person_id = await eid_svc.find_entity_id_by_type(
                    "wikidata", wiki_id, "person"
                )
                existing = None
                if existing_person_id:
                    existing = await self._session.scalar(
                        select(Person).options(selectinload(Person._external_ids)).where(Person.id == existing_person_id)
                    )
                if existing is not None:
                    existing.musicbrainz_artist_id = mbid
                    if not existing.name or existing.name == name:
                        pass  # keep existing name
                    await self._session.flush()
                    return existing

        # Check for existing person by case-insensitive name without an MBID,
        # and backfill the MBID instead of creating a duplicate.
        has_mbid = sa_exists().where(
            ExternalID.provider == "musicbrainz_artist",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        existing = await self._session.scalar(
            select(Person).options(selectinload(Person._external_ids)).where(
                sa_func.lower(Person.name) == name.lower(),
                not_(has_mbid),
            )
        )
        if existing is not None:
            existing.musicbrainz_artist_id = mbid
            # Also backfill wikidata_id if available
            if raw:
                relations = raw.get("relations")
                wiki_id = extract_wikidata_id(relations if isinstance(relations, list) else None)
                if wiki_id and not existing.wikidata_id:
                    existing.wikidata_id = wiki_id
            await self._session.flush()
            return existing

        # Use INSERT ... ON CONFLICT DO NOTHING to avoid race conditions
        # between concurrent sync tasks. Then re-query to get the row.
        wiki_id = None
        if raw:
            relations = raw.get("relations")
            wiki_id = extract_wikidata_id(relations if isinstance(relations, list) else None)

        person_id = f"oti_{uuid4().hex[:12]}"
        values = {"id": person_id, "name": name}

        await self._session.execute(
            pg_insert(Person)
            .values(**values)
            .on_conflict_do_nothing()
        )
        await eid_svc.upsert("musicbrainz_artist", mbid, "person", person_id)
        if wiki_id:
            await eid_svc.upsert("wikidata", wiki_id, "person", person_id)

        # Re-query via ExternalID to handle race conditions
        found_id = await eid_svc.find_entity_id_by_type(
            "musicbrainz_artist", mbid, "person"
        )
        person = await self._session.scalar(
            select(Person).options(selectinload(Person._external_ids)).where(Person.id == found_id)
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
