# TODO: Review this file
"""SteamGridDB asset hydration.

After an IGDB game has platform store IDs, this hydrator looks up the game on
SteamGridDB and stores grid (poster), hero (backdrop), logo, and icon assets
into ``media_assets``. Every grid is stored as a ``poster`` (with a variant
``label`` from its SGDB style); textless/material grids are ALSO stored as
``textless_poster``. The query-time selection service picks the best per type,
so the game appears in discover feeds (has_artwork filter) once any asset is
stored.

Supports all SGDB platforms: steam, origin, egs, bnet, uplay, flashpoint, eshop.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, Game, MediaItem
from otix.lib.types import JSONValue
from otix.providers.asset_pipeline import (
    AssetPipeline,
    RawAsset,
)
from otix.providers.steamgrid.client import SteamGridDBProvider

# Platforms SGDB supports, in priority order (most common first).
_SGDB_PLATFORMS = ("steam", "egs", "origin", "bnet", "uplay", "eshop", "flashpoint")

# SGDB asset style → label. Labels describe the visual variant so query-time
# selection can prefer logos that read on a dark UI (multicolor/white) over
# black, and textless grids over ones with the game title baked in.
_SGDB_LABELS: dict[str, dict[str, str]] = {
    "logo": {"official": "multicolor", "white": "white", "black": "black", "custom": "custom"},
    "poster": {"no_logo": "textless", "material": "material", "alternate": "alternate", "blurred": "blurred", "white": "white", "white_logo": "white_logo"},
    "textless_poster": {"no_logo": "textless", "material": "material", "alternate": "alternate", "blurred": "blurred", "white": "white", "white_logo": "white_logo"},
    "backdrop": {"material": "material", "blurred": "blurred", "alternate": "alternate"},
    "icon": {"official": "official", "custom": "custom"},
}


def _sgdb_label(asset_type: str, style: object) -> str | None:
    if not isinstance(style, str):
        return None
    return _SGDB_LABELS.get(asset_type, {}).get(style)


class SteamGridDBHydrator:
    """Fills in game artwork from SteamGridDB."""

    def __init__(self, provider: SteamGridDBProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate(
        self,
        game: Game,
        platform: str | None = None,
        platform_id: str | int | None = None,
        title: str | None = None,
    ) -> int:
        """Run all hydration steps. Returns number of new assets added.

        When platform+platform_id are explicit, uses that pair directly.
        Otherwise tries all platforms the game has IDs for (steam_app_id
        first, then store_ids), stopping at the first successful SGDB match.
        Falls back to name-based search when title is provided.
        """
        if platform is not None and platform_id is not None:
            return await self._hydrate_one(game, platform, platform_id)

        # Fast path: SGDB internal ID from a previous name-based lookup.
        sgdb_eid = await self._get_platform_id(game, "steamgrid")
        if sgdb_eid is not None:
            try:
                return await self._hydrate_assets(game, int(sgdb_eid))
            except (ValueError, TypeError):
                pass

        # Auto-detect: try platforms in priority order
        for plat in _SGDB_PLATFORMS:
            pid = await self._get_platform_id(game, plat)
            if pid is not None:
                added = await self._hydrate_one(game, plat, pid)
                if added > 0:
                    return added

        # Name-based fallback for game without any store IDs
        if title:
            return await self._hydrate_by_name(game, title)

        return 0

    async def _get_platform_id(self, game: Game, platform: str) -> str | int | None:
        """Get the platform-specific ID from ExternalID table."""
        ext_id = await self.session.scalar(
            select(ExternalID.external_id).where(
                ExternalID.provider == platform,
                ExternalID.entity_id == game.media_item_id,
                ExternalID.entity_type == "media_item",
            )
        )
        return ext_id

    async def _hydrate_one(
        self,
        game: Game,
        platform: str,
        platform_id: str | int,
    ) -> int:
        sgdb_game = await self.provider.get_game_by_platform_id(platform, platform_id)
        if sgdb_game is None:
            return 0

        sgdb_game_id = sgdb_game.get("id")
        if not isinstance(sgdb_game_id, int) or sgdb_game_id == 0:
            return 0

        await self._backfill_store_ids(game, sgdb_game)
        return await self._hydrate_assets(game, sgdb_game_id)

    async def _hydrate_by_name(self, game: Game, title: str) -> int:
        """Search SteamGridDB by game name and hydrate from the best match.

        Also backfills platform-store ExternalIDs from the SGDB match so
        future syncs can use direct platform-ID lookups instead of name search.
        """
        results = await self.provider.search_games(title)
        if not results:
            return 0

        best = self._pick_best_match(results, title)
        if best is None:
            return 0

        sgdb_game_id = best.get("id")
        if not isinstance(sgdb_game_id, int) or sgdb_game_id == 0:
            return 0

        # Fetch full game object for platform IDs, then backfill ExternalIDs.
        full = await self.provider.get_game_by_id(sgdb_game_id)
        if full is not None:
            await self._backfill_store_ids(game, full)

        return await self._hydrate_assets(game, sgdb_game_id)

    async def _backfill_store_ids(self, game: Game, sgdb_game: dict[str, JSONValue]) -> None:
        """Store the SGDB internal game ID as an ExternalID for future fast-path lookups.

        The SGDB get_game_by_id endpoint doesn't expose platform-specific
        IDs, but storing the SGDB ID lets us skip the name search next time.
        """
        sgdb_id = sgdb_game.get("id")
        if not isinstance(sgdb_id, int) or sgdb_id == 0:
            return

        from otix.services.external_id_service import ExternalIDService

        eid_svc = ExternalIDService(self.session)
        await eid_svc.upsert("steamgrid", str(sgdb_id), "media_item", game.media_item_id)

    @staticmethod
    def _pick_best_match(
        results: list[dict[str, JSONValue]],
        title: str,
    ) -> dict[str, JSONValue] | None:
        """Pick the best match from SGDB search results.

        Prefers exact name match, then case-insensitive match, then
        the first result as a fallback.
        """
        if not results:
            return None

        title_lower = title.lower().strip()
        for r in results:
            name = r.get("name")
            if isinstance(name, str) and name.lower().strip() == title_lower:
                return r

        return results[0]

    async def _hydrate_assets(self, game: Game, sgdb_game_id: int) -> int:
        media_item = await self.session.get(MediaItem, game.media_item_id)
        if media_item is None:
            return 0

        # Fetch all asset types in parallel
        grids, heroes, logos, icons = await self._fetch_assets(sgdb_game_id)

        # Store every grid as a poster (selection prefers textless/clean art at
        # query time); textless/material grids are ALSO stored as
        # textless_poster so a textless-only slot stays available.
        raw_grids: list[RawAsset] = []
        raw_textless: list[RawAsset] = []
        for e in grids:
            url = e.get("url")
            if not isinstance(url, str):
                continue
            style = e.get("style")
            raw_grids.append(
                RawAsset(
                    asset_type="poster",
                    url=url,
                    provider="steamgrid",
                    width=e.get("width"),
                    height=e.get("height"),
                    lang=e.get("language"),
                    style=style,
                    label=_sgdb_label("poster", style),
                    score=e.get("score"),
                )
            )
            if style in {"no_logo", "material"}:
                raw_textless.append(
                    RawAsset(
                        asset_type="textless_poster",
                        url=url,
                        provider="steamgrid",
                        width=e.get("width"),
                        height=e.get("height"),
                        lang=e.get("language"),
                        style=style,
                        label=_sgdb_label("textless_poster", style),
                        score=e.get("score"),
                    )
                )

        def _to_raw(entries: list[dict], asset_type: str, provider: str = "steamgrid") -> list[RawAsset]:
            return [
                RawAsset(
                    asset_type=asset_type,
                    url=e["url"],
                    provider=provider,
                    width=e.get("width"),
                    height=e.get("height"),
                    lang=e.get("language"),
                    style=e.get("style"),
                    label=_sgdb_label(asset_type, e.get("style")),
                    score=e.get("score"),
                )
                for e in entries
                if isinstance(e.get("url"), str)
            ]

        raw_heroes = _to_raw(heroes, "backdrop")
        raw_logos = _to_raw(logos, "logo")
        raw_icons = _to_raw(icons, "icon")

        pipeline = AssetPipeline(self.session)
        added = 0
        added += await pipeline.store(media_item.id, raw_grids)
        added += await pipeline.store(media_item.id, raw_textless)
        added += await pipeline.store(media_item.id, raw_heroes)
        added += await pipeline.store(media_item.id, raw_logos)
        added += await pipeline.store(media_item.id, raw_icons)

        # Promote using game-specific rules from AssetPipeline
        await pipeline.promote_all(
            media_item,
            {
                "textless_poster": raw_textless,
                "logo": raw_logos,
                "icon": raw_icons,
                "backdrop": raw_heroes,
            },
            media_type="game",
        )

        return added

    async def _fetch_assets(
        self, sgdb_game_id: int
    ) -> tuple[
        list[dict[str, JSONValue]],
        list[dict[str, JSONValue]],
        list[dict[str, JSONValue]],
        list[dict[str, JSONValue]],
    ]:
        """Fetch grids, heroes, logos, and icons in parallel.

        Uses return_exceptions so one failing asset type doesn't block the others.
        """
        results = await asyncio.gather(
            self.provider.get_grids(sgdb_game_id),
            self.provider.get_heroes(sgdb_game_id),
            self.provider.get_logos(sgdb_game_id),
            self.provider.get_icons(sgdb_game_id),
            return_exceptions=True,
        )

        def _unwrap(result: object) -> list[dict[str, JSONValue]]:
            if isinstance(result, Exception):
                return []
            return result if isinstance(result, list) else []

        return (
            _unwrap(results[0]),
            _unwrap(results[1]),
            _unwrap(results[2]),
            _unwrap(results[3]),
        )
