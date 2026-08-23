# TODO: Review this file
"""TheAudioDB enrichment: artwork, cross-platform IDs, metadata gap filling."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, MediaAsset
from otix.domain.people import MediaCredit, Person
from otix.providers.theaudiodb.client import TheAudioDBProvider
from otix.services.external_id_service import ExternalIDService


class TheAudioDBHydrator:
    def __init__(self, provider: TheAudioDBProvider, session: AsyncSession):
        self._provider = provider
        self._session = session

    async def hydrate_album(self, album: Album) -> int:
        """Enrich an album from TheAudioDB: artwork, cross-platform IDs, metadata.

        Returns the number of external IDs added.
        """
        artist_name = await self._get_primary_artist(album.media_item_id)

        # Try search by artist+album first
        tadb = None
        if artist_name:
            query = f"{artist_name} {album.media_item.title}"
            tadb = await self._provider.search_album(query)

        if not tadb:
            return 0

        external_id_count = 0

        # ── Cross-platform IDs — batch-check existing ──
        id_mappings: list[tuple[str, str]] = [
            ("strMusicBrainzID", "musicbrainz"),
            ("strMusicBrainzAlbumID", "musicbrainz"),
            ("strAppleMusicID", "apple_music"),
            ("strDeezerID", "deezer"),
        ]
        id_vals: list[tuple[str, str, str]] = []  # (provider, external_id, field)
        for field, provider_name in id_mappings:
            val = tadb.get(field)
            if isinstance(val, str) and val and val != "0":
                id_vals.append((provider_name, val, field))

        if id_vals:
            existing_ids = (await self._session.scalars(
                select(ExternalID.external_id).where(
                    ExternalID.provider.in_([p for p, _, _ in id_vals]),
                    ExternalID.external_id.in_([v for _, v, _ in id_vals]),
                )
            )).all()
            existing_id_set = set(existing_ids)

            eid_svc = ExternalIDService(self._session)
            for provider_name, val, _ in id_vals:
                if val not in existing_id_set:
                    await eid_svc.upsert(
                        provider_name, val,
                        "media_item", album.media_item_id,
                    )
                    external_id_count += 1

        # Backfill MusicBrainz release group ID if missing
        mbid_album = tadb.get("strMusicBrainzAlbumID")
        if isinstance(mbid_album, str) and mbid_album:
            existing_mbid = await self._session.scalar(
                select(ExternalID.external_id).where(
                    ExternalID.provider == "musicbrainz",
                    ExternalID.entity_id == album.media_item_id,
                    ExternalID.entity_type == "media_item",
                )
            )
            if not existing_mbid:
                album.musicbrainz_id = mbid_album

        # ── Artwork — batch-check existing URLs ──
        image_fields = [
            ("strAlbumThumb", "poster"),
            ("strAlbumThumbBack", "backdrop"),
            ("strAlbumCDart", "poster"),
            ("strAlbumLogo", "logo"),
        ]
        img_urls: list[tuple[str, str]] = []
        for field, asset_type in image_fields:
            url = tadb.get(field)
            if isinstance(url, str) and url.startswith("http"):
                img_urls.append((url, asset_type))

        if img_urls:
            existing_urls = (await self._session.scalars(
                select(MediaAsset.url).where(
                    MediaAsset.media_item_id == album.media_item_id,
                    MediaAsset.url.in_([u for u, _ in img_urls]),
                )
            )).all()
            existing_url_set = set(existing_urls)

            for url, asset_type in img_urls:
                if url not in existing_url_set:
                    self._session.add(MediaAsset(
                        media_item_id=album.media_item_id,
                        asset_type=asset_type,
                        url=url,
                        provider="theaudiodb",
                    ))

        # Description — fill if no overview exists yet
        description = tadb.get("strDescriptionEN") or tadb.get("strDescription")
        if isinstance(description, str) and description and not album.media_item.overview:
            album.media_item.overview = description[:2000]

        # Release year — fill if no release_date
        year = tadb.get("intYearReleased")
        if year and not album.media_item.release_date:
            try:
                from datetime import date
                album.media_item.release_date = date(int(str(year)), 1, 1)
            except (ValueError, TypeError):
                pass

        await self._session.flush()
        return external_id_count

    async def _get_primary_artist(self, media_item_id: str) -> str | None:
        result = await self._session.execute(
            select(Person.name)
            .join(MediaCredit, MediaCredit.person_id == Person.id)
            .where(MediaCredit.media_item_id == media_item_id, MediaCredit.role == "primary")
        )
        return result.scalar()
