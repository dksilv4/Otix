# TODO: Review this file
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
from otix.domain.media import ExternalID, Game, MediaItem
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
        self, game: Game, platform: str, platform_id: str | int,
    ) -> int:
        sgdb_game = await self.provider.get_game_by_platform_id(platform, platform_id)
        if sgdb_game is None:
            return 0

        sgdb_game_id = sgdb_game.get("id")
        if not isinstance(sgdb_game_id, int) or sgdb_game_id == 0:
            return 0

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
        results: list[dict[str, JSONValue]], title: str,
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

        # Icons → icon_url (prefer official style, prefer PNG over ICO)
        if not media_item.icon_url:
            icon = self._pick_icon(icons)
            if icon and isinstance(icon.get("url"), str):
                media_item.icon_url = icon["url"]

        # Heroes → backdrop. Avoid alternate heroes because they commonly include logo/title text.
        # Promote a text-safe SGDB hero even if IGDB already supplied a backdrop.
        hero = self._pick_hero(heroes)
        if hero and isinstance(hero.get("url"), str) and media_item.backdrop_url != hero["url"]:
            from otix.services.admin_edit_service import AdminEditService
            protected = await AdminEditService.get_protected_image_types(
                self.session, media_item.id
            )
            if "backdrop" in protected and media_item.backdrop_url:
                svc = AdminEditService(self.session)
                await svc.create_system_proposal_for_image(
                    media_item.id, "backdrop", hero["url"]
                )
            else:
                media_item.backdrop_url = hero["url"]

        return added

    async def _fetch_assets(self, sgdb_game_id: int) -> tuple[
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

    def _pick_icon(self, icons: list[dict[str, JSONValue]]) -> dict[str, JSONValue] | None:
        """Pick the best icon, preferring PNG over ICO and official over custom."""
        if not icons:
            return None

        style_rank = {"official": 0, "custom": 1}
        best = None
        best_rank = 999
        best_score = -1
        for icon in icons:
            url = icon.get("url", "")
            is_png = isinstance(url, str) and url.lower().endswith(".png")
            rank = style_rank.get(icon.get("style"), 2)
            score = icon.get("score", 0) or 0
            # PNG preferred: subtract 0.5 from rank so it beats same-style ICO
            effective_rank = rank - 0.5 if is_png else rank
            if effective_rank < best_rank or (effective_rank == best_rank and score > best_score):
                best_rank = effective_rank
                best_score = score
                best = icon

        return best

    async def _store_assets(
        self,
        media_item: MediaItem,
        entries: list[dict[str, JSONValue]],
        asset_type: str | Callable[[dict[str, JSONValue]], str],
    ) -> int:
        if not entries:
            return 0

        # Resolve asset types and collect valid URLs
        resolved: list[tuple[str, str, dict[str, JSONValue]]] = []
        for entry in entries:
            url = entry.get("url")
            if not isinstance(url, str) or not url:
                continue
            at = asset_type(entry) if callable(asset_type) else asset_type
            resolved.append((url, at, entry))

        if not resolved:
            return 0

        # Batch-check existing URLs
        urls = [r[0] for r in resolved]
        existing = await self.session.scalars(
            select(MediaAsset.url).where(MediaAsset.url.in_(urls))
        )
        existing_urls = set(existing.all())

        added = 0
        for url, at, entry in resolved:
            if url in existing_urls:
                continue
            self.session.add(
                MediaAsset(
                    media_item_id=media_item.id,
                    asset_type=at,
                    url=url,
                    width=entry.get("width"),
                    height=entry.get("height"),
                    style=entry.get("style"),
                    score=entry.get("score"),
                    provider="steamgrid",
                )
            )
            added += 1
        return added
