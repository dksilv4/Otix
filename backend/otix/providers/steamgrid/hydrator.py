"""SteamGridDB asset hydration.

After an IGDB game has platform store IDs, this hydrator looks up the game on
SteamGridDB and stores grid (poster), hero (backdrop), logo, and icon assets.
It sets logo_url and textless_poster_url on the MediaItem so the game appears
in discover feeds (has_artwork filter).

Supports all SGDB platforms: steam, origin, egs, bnet, uplay, flashpoint, eshop.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import MediaAsset
from otix.domain.media import Game, MediaItem
from otix.lib.types import JSONValue
from otix.providers.steamgrid.client import SteamGridDBProvider

# Platforms SGDB supports, in priority order (most common first).
_SGDB_PLATFORMS = ("steam", "egs", "origin", "bnet", "uplay", "eshop", "flashpoint")


def _pick_best(assets: list[dict[str, JSONValue]]) -> dict[str, JSONValue] | None:
    """Pick the highest-scored asset. Falls back to first."""
    if not assets:
        return None
    best = None
    best_score = -1
    for a in assets:
        score = a.get("score", 0)
        if isinstance(score, (int, float)) and score > best_score:
            best_score = int(score)
            best = a
    return best or assets[0]


class SteamGridDBHydrator:
    """Fills in game artwork from SteamGridDB."""

    def __init__(self, provider: SteamGridDBProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate(
        self, game: Game,
        platform: str | None = None,
        platform_id: str | int | None = None,
    ) -> int:
        """Run all hydration steps. Returns number of new assets added.

        When platform+platform_id are explicit, uses that pair directly.
        Otherwise tries all platforms the game has IDs for (steam_app_id
        first, then store_ids), stopping at the first successful SGDB match.
        """
        if platform is not None and platform_id is not None:
            return await self._hydrate_one(game, platform, platform_id)

        # Auto-detect: try platforms in priority order
        for plat in _SGDB_PLATFORMS:
            pid = self._get_platform_id(game, plat)
            if pid is not None:
                added = await self._hydrate_one(game, plat, pid)
                if added > 0:
                    return added
        return 0

    @staticmethod
    def _get_platform_id(game: Game, platform: str) -> str | int | None:
        """Get the platform-specific ID from a Game's stored IDs."""
        if platform == "steam" and game.steam_app_id:
            return game.steam_app_id
        if game.store_ids and platform in game.store_ids:
            return game.store_ids[platform]
        return None

    async def _hydrate_one(
        self, game: Game, platform: str, platform_id: str | int,
    ) -> int:

        # Look up the game on SteamGridDB
        sgdb_game = await self.provider.get_game_by_platform_id(platform, platform_id)
        if sgdb_game is None:
            return 0

        sgdb_game_id = sgdb_game.get("id")
        if not isinstance(sgdb_game_id, int) or sgdb_game_id == 0:
            return 0

        media_item = await self.session.get(MediaItem, game.media_item_id)
        if media_item is None:
            return 0

        # Fetch all asset types in parallel
        grids, heroes, logos, icons = await self._fetch_assets(sgdb_game_id)

        # Store every returned SGDB asset. Promotion below only controls the
        # primary URLs used by cards/heroes; it should not limit asset history.
        added = 0
        added += await self._store_assets(media_item, grids, self._grid_asset_type)
        added += await self._store_assets(media_item, heroes, "backdrop")
        added += await self._store_assets(media_item, logos, "logo")
        added += await self._store_assets(media_item, icons, "icon")

        # Grids → textless poster (no_logo and material only — alternate may have text)
        if not media_item.textless_poster_url:
            best = self._pick_grid(grids)
            if best and isinstance(best.get("url"), str):
                media_item.textless_poster_url = best["url"]

        # Logos → logo_url (prefer official style)
        if not media_item.logo_url:
            logo = self._pick_logo(logos)
            if logo and isinstance(logo.get("url"), str):
                media_item.logo_url = logo["url"]

        # Heroes → backdrop. Avoid alternate heroes because they commonly include logo/title text.
        # Promote a text-safe SGDB hero even if IGDB already supplied a backdrop.
        hero = self._pick_hero(heroes)
        if hero and isinstance(hero.get("url"), str) and media_item.backdrop_url != hero["url"]:
            media_item.backdrop_url = hero["url"]

        return added

    async def _fetch_assets(self, sgdb_game_id: int) -> tuple[
        list[dict[str, JSONValue]],
        list[dict[str, JSONValue]],
        list[dict[str, JSONValue]],
        list[dict[str, JSONValue]],
    ]:
        """Fetch grids, heroes, logos, and icons in parallel."""
        grids, heroes, logos, icons = await asyncio.gather(
            self.provider.get_grids(sgdb_game_id),
            self.provider.get_heroes(sgdb_game_id),
            self.provider.get_logos(sgdb_game_id),
            self.provider.get_icons(sgdb_game_id),
        )
        return grids, heroes, logos, icons

    @staticmethod
    def _grid_asset_type(entry: dict[str, JSONValue]) -> str:
        """Classify SGDB grids while preserving text-safe grids for promotion."""
        if entry.get("style") in {"no_logo", "material"}:
            return "textless_poster"
        return "poster"

    def _pick_grid(self, grids: list[dict[str, JSONValue]]) -> dict[str, JSONValue] | None:
        """Pick the best grid for a textless poster.

        Only considers no_logo (strictly textless) and material styles.
        Falls back to any grid only if neither style is available.
        """
        if not grids:
            return None

        style_rank = {"no_logo": 0, "material": 1}
        textless = [g for g in grids if g.get("style") in style_rank]
        candidates = textless if textless else grids

        best = None
        best_rank = 999
        best_score = -1
        for g in candidates:
            rank = style_rank.get(g.get("style"), 2)
            score = g.get("score", 0) or 0
            if rank < best_rank or (rank == best_rank and score > best_score):
                best_rank = rank
                best_score = score
                best = g

        return best

    def _pick_hero(self, heroes: list[dict[str, JSONValue]]) -> dict[str, JSONValue] | None:
        """Pick the best text-safe hero for a backdrop.

        SteamGridDB's alternate hero style can include title/logo text. Material
        and blurred heroes are safer as background layers because Otix renders a
        separate logo/title over the backdrop.
        """
        if not heroes:
            return None

        style_rank = {"material": 0, "blurred": 1}
        candidates = [h for h in heroes if h.get("style") in style_rank]
        if not candidates:
            return None

        best = None
        best_rank = 999
        best_score = -1
        for h in candidates:
            rank = style_rank.get(h.get("style"), 999)
            score = h.get("score", 0) or 0
            if rank < best_rank or (rank == best_rank and score > best_score):
                best_rank = rank
                best_score = score
                best = h

        return best

    def _pick_logo(self, logos: list[dict[str, JSONValue]]) -> dict[str, JSONValue] | None:
        """Pick the best logo, preferring official over custom.

        Priority: official > white > black > custom.
        """
        if not logos:
            return None

        style_rank = {"official": 0, "white": 1, "black": 2, "custom": 3}
        best = None
        best_rank = 999
        best_score = -1
        for logo in logos:
            rank = style_rank.get(logo.get("style"), 4)
            score = logo.get("score", 0) or 0
            if rank < best_rank or (rank == best_rank and score > best_score):
                best_rank = rank
                best_score = score
                best = logo

        return best

    async def _store_assets(
        self,
        media_item: MediaItem,
        entries: list[dict[str, JSONValue]],
        asset_type: str | Callable[[dict[str, JSONValue]], str],
    ) -> int:
        added = 0
        for entry in entries:
            resolved_type = asset_type(entry) if callable(asset_type) else asset_type
            if await self._store_asset(media_item, entry, resolved_type):
                added += 1
        return added

    async def _store_asset(
        self, media_item: MediaItem, entry: dict[str, JSONValue], asset_type: str
    ) -> bool:
        url = entry.get("url")
        if not isinstance(url, str) or not url:
            return False

        # Skip if URL already exists
        exists = await self.session.scalar(
            select(MediaAsset.url).where(MediaAsset.url == url)
        )
        if exists:
            return False

        self.session.add(
            MediaAsset(
                media_item_id=media_item.id,
                asset_type=asset_type,
                url=url,
                width=entry.get("width"),
                height=entry.get("height"),
                style=entry.get("style"),
                score=entry.get("score"),
                provider="steamgrid",
            )
        )
        return True
