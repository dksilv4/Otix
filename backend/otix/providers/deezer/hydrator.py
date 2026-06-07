# TODO: Review this file
"""Deezer enrichment: tracks, artist credits, external IDs."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, Track
from otix.domain.people import MediaCredit, Person
from otix.lib.types import JSONValue
from otix.services.external_id_service import ExternalIDService


class DeezerHydrator:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def hydrate_tracks_and_ids(self, album: Album, raw: dict[str, JSONValue], tracks: list[Track] | None = None) -> list[str]:
        """Upsert tracks with ISRCs and store Deezer ID + UPC as ExternalIDs.

        Args:
            album: The album to associate tracks with.
            raw: Raw album data from Deezer API.
            tracks: Tracks to hydrate. If None, reads from album.tracks.

        Returns list of ISRCs found on tracks for downstream MB matching.
        """
        track_list = tracks if tracks is not None else album.tracks
        isrcs: list[str] = []

        # Delete existing tracks and rebuild (cleanest for mutable tracklists)
        existing = (await self._session.execute(select(Track).where(Track.album_id == album.media_item_id))).scalars().all()
        existing_isrcs = {t.isrc for t in existing if t.isrc}

        for t in track_list:
            if t.isrc and t.isrc in existing_isrcs:
                continue
            t.album_id = album.media_item_id
            self._session.add(t)
            if t.isrc:
                isrcs.append(t.isrc)

        # Store Deezer ID as ExternalID
        deezer_id = getattr(album, "_deezer_id", None)
        if deezer_id:
            eid_svc = ExternalIDService(self._session)
            await eid_svc.upsert(
                "deezer",
                str(deezer_id),
                "media_item",
                album.media_item_id,
            )

        # Store UPC/EAN barcode as ExternalID
        upc = getattr(album, "_upc", None)
        if upc:
            eid_svc = ExternalIDService(self._session)
            await eid_svc.upsert(
                "barcode",
                upc,
                "media_item",
                album.media_item_id,
            )

        await self._session.flush()
        return isrcs

    async def hydrate_artist_credits(self, album: Album, raw: dict[str, JSONValue]) -> str | None:
        """Create Person + MediaCredit for the album's primary artist.

        Returns the Deezer artist ID for downstream artist seeding.
        """
        artist_data = raw.get("artist")
        if not isinstance(artist_data, dict):
            return None

        name = str(artist_data.get("name", ""))
        deezer_artist_id = str(artist_data.get("id", "")) if artist_data.get("id") else None

        if not name:
            return None

        person = await self._get_or_create_artist(name, deezer_artist_id, artist_data)

        exists = await self._session.scalar(
            select(MediaCredit).where(
                MediaCredit.media_item_id == album.media_item_id,
                MediaCredit.person_id == person.id,
                MediaCredit.role == "primary",
            )
        )
        if not exists:
            self._session.add(
                MediaCredit(
                    media_item_id=album.media_item_id,
                    person_id=person.id,
                    role="primary",
                    character_name=name,
                    sort_order=0,
                )
            )

        return deezer_artist_id

    async def hydrate_genres(self, album: Album, raw: dict[str, JSONValue]) -> None:
        from uuid import uuid4

        from sqlalchemy.dialects.postgresql import insert as pg_insert

        from otix.domain.genre import Genre, MediaGenre

        genres_data = raw.get("genres", {})
        items = genres_data.get("data", []) if isinstance(genres_data, dict) else []
        if not isinstance(items, list) or not items:
            return

        names = []
        for g in items:
            if isinstance(g, dict) and g.get("name"):
                names.append(str(g["name"]))
        if not names:
            return

        slugs = [n.lower().replace(" ", "-").replace("/", "-") for n in names]

        # Batch-check existing genres
        existing_genres = (await self._session.scalars(select(Genre).where(Genre.slug.in_(slugs)))).all()
        genre_by_slug = {g.slug: g for g in existing_genres}

        # Create missing genres with INSERT ON CONFLICT DO NOTHING
        new_genres = []
        for name, slug in zip(names, slugs, strict=False):
            if slug not in genre_by_slug:
                gid = f"oti_{uuid4().hex[:12]}"
                new_genres.append({"id": gid, "name": name, "slug": slug})
        if new_genres:
            await self._session.execute(pg_insert(Genre).values(new_genres).on_conflict_do_nothing())
            # Re-query to get the IDs of newly inserted genres
            refreshed = (await self._session.scalars(select(Genre).where(Genre.slug.in_([g["slug"] for g in new_genres])))).all()
            for g in refreshed:
                genre_by_slug[g.slug] = g

        # Batch-check existing MediaGenre links
        genre_ids = [g.id for g in genre_by_slug.values()]
        if genre_ids:
            existing_links = (
                await self._session.scalars(
                    select(MediaGenre.genre_id).where(
                        MediaGenre.media_item_id == album.media_item_id,
                        MediaGenre.genre_id.in_(genre_ids),
                    )
                )
            ).all()
            existing_genre_ids = set(existing_links)

            for name in names:
                slug = name.lower().replace(" ", "-").replace("/", "-")
                genre = genre_by_slug.get(slug)
                if genre and genre.id not in existing_genre_ids:
                    self._session.add(
                        MediaGenre(
                            media_item_id=album.media_item_id,
                            genre_id=genre.id,
                        )
                    )

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get_or_create_artist(self, name: str, deezer_id: str | None, raw: dict | None = None) -> Person:
        from sqlalchemy import func as sa_func

        # Try by name first (case-insensitive)
        person = await self._session.scalar(select(Person).where(sa_func.lower(Person.name) == name.lower()))
        if person is not None:
            # Backfill picture if missing
            if raw and not person.photo_url:
                pic = raw.get("picture_medium") or raw.get("picture_big") or raw.get("picture")
                if isinstance(pic, str) and pic:
                    person.photo_url = pic
            return person

        # Create new Person
        person = Person(name=name, photo_url=_extract_picture(raw))
        self._session.add(person)
        await self._session.flush()
        return person


def _extract_picture(raw: dict | None) -> str | None:
    if not raw:
        return None
    for size in ("picture_medium", "picture_big", "picture", "picture_small"):
        url = raw.get(size)
        if isinstance(url, str) and url:
            return url
    return None
