"""Fanart image hydration.

After TMDB sync lands core media data, this hydrator adds high-quality artwork
from Fanart.tv as additional MediaAsset rows. URL uniqueness prevents duplicates
on re-sync.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import MediaAsset
from otix.domain.media import ExternalID, MediaItem
from otix.providers.fanart.client import FanartProvider
from otix.providers.fanart.transformer import game_images_to_assets, movie_images_to_assets, show_images_to_assets


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
        """Insert only assets whose URLs don't already exist in the DB."""
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
            return True

        return False
