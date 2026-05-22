"""Fanart image hydration.

After TMDB sync lands core media data, this hydrator adds high-quality artwork
from Fanart.tv as additional MediaAsset rows. URL uniqueness prevents duplicates
on re-sync.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import MediaAsset
from otix.domain.media import Album, ExternalID, MediaItem
from otix.domain.people import MediaCredit, Person
from otix.providers.fanart.client import FanartProvider
from otix.providers.fanart.transformer import (
    game_images_to_assets,
    movie_images_to_assets,
    music_images_to_assets,
    show_images_to_assets,
    _extract_album_covers_by_rg,
    _extract_artist_assets,
)


class FanartHydrator:
    def __init__(self, provider: FanartProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate_movie_images(self, media_item: MediaItem) -> bool:
        """Fetch Fanart images for a movie and store as MediaAsset rows.

        Uses TMDB ID from ExternalID to query Fanart. Returns True if any new
        assets were added.
        """
        tmdb_id_str = await self._resolve_external_id(media_item.id, "tmdb")
        if tmdb_id_str is None:
            return False
        try:
            tmdb_id = int(tmdb_id_str)
        except (ValueError, TypeError):
            return False

        try:
            raw = await self.provider.get_movie_images(tmdb_id)
        except Exception:
            return False

        assets = movie_images_to_assets(raw, media_item.id)
        if not assets:
            return False

        return await self._upsert_assets(assets)

    async def hydrate_show_images(self, media_item: MediaItem) -> bool:
        """Fetch Fanart images for a show and store as MediaAsset rows.

        Uses TVDB ID from ExternalID to query Fanart. Returns True if any new
        assets were added.
        """
        tvdb_id_str = await self._resolve_external_id(media_item.id, "tvdb")
        if tvdb_id_str is None:
            return False
        try:
            tvdb_id = int(tvdb_id_str)
        except (ValueError, TypeError):
            return False

        try:
            raw = await self.provider.get_show_images(tvdb_id)
        except Exception:
            return False

        assets = show_images_to_assets(raw, media_item.id)
        if not assets:
            return False

        return await self._upsert_assets(assets)

    async def hydrate_game_images(self, media_item: MediaItem) -> bool:
        """Fetch Fanart images for a game and store as MediaAsset rows.

        Uses the Fanart.tv game ID from ExternalID. Returns True if any new
        assets were added.
        """
        fanart_id = await self._resolve_external_id(media_item.id, "fanart")
        if fanart_id is None:
            return False

        try:
            raw = await self.provider.get_game_images(fanart_id)
        except Exception:
            return False

        assets = game_images_to_assets(raw, media_item.id)
        if not assets:
            return False

        return await self._upsert_assets(assets)

    async def hydrate_music_images(self, media_item: MediaItem) -> bool:
        """Fetch Fanart images for a music album and store as MediaAsset rows.

        Resolves the primary artist's MusicBrainz artist ID via media_credits
        → people, then fetches artist-level artwork (logos, backgrounds) and
        album covers from Fanart.tv.

        Album covers are matched to the specific album by release group MBID
        so different albums from the same artist get their correct cover.
        Artist logos are set on the Person record, not the media item.
        """
        result = await self.session.execute(
            select(Person.musicbrainz_artist_id, Person.id, Album.musicbrainz_release_group_id)
            .join(MediaCredit, MediaCredit.person_id == Person.id)
            .join(Album, Album.media_item_id == media_item.id)
            .where(
                MediaCredit.media_item_id == media_item.id,
                MediaCredit.role == "primary",
            )
            .order_by(MediaCredit.sort_order)
            .limit(1)
        )
        row = result.first()
        if row is None:
            return False
        artist_mbid, person_id, release_group_mbid = row

        try:
            raw = await self.provider.get_music_images(artist_mbid)
        except Exception:
            return False

        # Extract artist-level assets (logos, backgrounds, thumbs, banners).
        # Album covers are matched by release group below — not included here.
        artist_assets = _extract_artist_assets(raw, media_item.id)
        album_covers = _extract_album_covers_by_rg(raw)

        any_added = False

        # Upsert artist-level assets into media_assets.
        if artist_assets:
            any_added |= await self._upsert_assets(artist_assets)

        # Match specific album cover by release group MBID and set poster_url.
        if release_group_mbid and release_group_mbid in album_covers:
            cover_url = album_covers[release_group_mbid]
            if cover_url and not media_item.poster_url:
                media_item.poster_url = cover_url
                any_added = True
            # Also persist as a MediaAsset so it shows in the asset gallery.
            exists = await self.session.scalar(
                select(MediaAsset.url).where(MediaAsset.url == cover_url)
            )
            if not exists:
                self.session.add(MediaAsset(
                    media_item_id=media_item.id,
                    asset_type="poster",
                    url=cover_url,
                    provider="fanart",
                ))
                any_added = True

        # Set artist logo on Person, not on the media item.
        logo_assets = [a for a in artist_assets if a.asset_type == "logo"]
        if logo_assets and person_id:
            en_logos = [a for a in logo_assets if a.lang == "en"]
            best = max(en_logos if en_logos else logo_assets, key=lambda a: a.width or 0)
            person = await self.session.get(Person, person_id)
            if person and not person.logo_url:
                person.logo_url = best.url
                any_added = True

        return any_added

    async def _resolve_external_id(self, media_item_id: str, provider: str) -> str | None:
        ext_id = await self.session.scalar(
            select(ExternalID).where(
                ExternalID.media_item_id == media_item_id,
                ExternalID.provider == provider,
            )
        )
        if ext_id is None:
            return None
        return ext_id.external_id

    async def _upsert_assets(self, assets: list[MediaAsset]) -> bool:
        """Insert only assets whose URLs don't already exist in the DB.

        Also sets logo_url / textless_poster_url on the owning MediaItem
        so the API doesn't need to join through media_assets for list views.
        """
        urls = {a.url for a in assets}
        if not urls:
            return False

        existing = await self.session.scalars(
            select(MediaAsset.url).where(MediaAsset.url.in_(urls))
        )
        existing_urls = set(existing)

        new_assets = [a for a in assets if a.url not in existing_urls]
        if new_assets:
            self.session.add_all(new_assets)
            await self.session.flush()

        # Set logo_url / textless_poster_url on the MediaItem.
        # Fanart is the authoritative source.
        #
        # Textless posters are from the "poster" category (moviethumb/tvthumb are
        # disc/case art, not posters). Fanart marks textless artwork with lang
        # "", "0", "00", or "zxx".
        if assets:
            media_item_id = assets[0].media_item_id
            media_item = await self.session.get(MediaItem, media_item_id)
            if media_item is not None:
                # Check which image types are protected by admin '*' overrides.
                from otix.services.admin_edit_service import AdminEditService
                protected = await AdminEditService.get_protected_image_types(
                    self.session, media_item.id
                )

                # Logo: prefer English, then widest fallback.
                logo_assets = [a for a in assets if a.asset_type == "logo"]
                en_logos = [a for a in logo_assets if a.lang == "en"]
                best_logo = None
                if en_logos:
                    best_logo = max(en_logos, key=lambda a: a.width or 0)
                elif logo_assets:
                    best_logo = max(logo_assets, key=lambda a: a.width or 0)
                # Music logo + poster promotion is handled in hydrate_music_images
                # (artist logos go on Person, album covers matched by release group).
                if best_logo and media_item.media_type != "music":
                    if "logo" in protected and media_item.logo_url and media_item.logo_url != best_logo.url:
                        svc = AdminEditService(self.session)
                        await svc.create_system_proposal_for_image(
                            media_item.id, "logo", best_logo.url
                        )
                    else:
                        media_item.logo_url = best_logo.url

                # Poster promotion (non-music only): textless posters → textless_poster_url.
                if media_item.media_type != "music":
                    _textless_langs = {None, "", "0", "00", "zxx"}
                    best_textless = max(
                        (a for a in assets
                         if a.asset_type == "poster" and a.lang in _textless_langs),
                        key=lambda a: a.width or 0,
                        default=None,
                    )
                    if best_textless:
                        if "textless_poster" in protected and media_item.textless_poster_url and media_item.textless_poster_url != best_textless.url:
                            svc = AdminEditService(self.session)
                            await svc.create_system_proposal_for_image(
                                media_item.id, "textless_poster", best_textless.url
                            )
                        else:
                            media_item.textless_poster_url = best_textless.url

        return bool(new_assets)
