"""Provider-agnostic asset storage and promotion pipeline.

Every provider hydrator follows the same pattern:
  1. Collect raw assets from provider API
  2. Store them as MediaAsset rows (URL-deduplicated)
  3. Promote the best one to the MediaItem column

This pipeline extracts steps 2 and 3 so hydrators don't duplicate
the store+promote logic. Each hydrator only needs to define how it
collects assets and which ranking strategy to use per asset type.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import MediaAsset
from otix.domain.media import MediaItem

# ── Standardised asset descriptor ──────────────────────────────────────


@dataclass
class RawAsset:
    """Standardised asset descriptor from any provider.

    Hydrators emit these instead of directly creating MediaAsset rows.
    The AssetPipeline handles storage and promotion.
    """
    asset_type: str  # "poster", "backdrop", "logo", "icon", "textless_poster", etc.
    url: str
    provider: str  # "tmdb", "fanart", "steamgrid", "igdb", "theaudiodb", "deezer"
    width: int | None = None
    height: int | None = None
    lang: str | None = None          # ISO 639-1; None/"zxx"/"0" = textless
    style: str | None = None         # Provider-specific style name
    label: str | None = None         # Variant semantics: logo "multicolor"/"white"/"black", etc.
    score: int | None = None         # Community score
    extra: dict = field(default_factory=dict)  # Provider-specific metadata


# ── Promotion rankers ──────────────────────────────────────────────────
# Each takes a list of RawAsset and returns the best match or None.

PromotionRanker = Callable[[list[RawAsset]], RawAsset | None]


def rank_by_width(assets: list[RawAsset]) -> RawAsset | None:
    """Pick the widest asset."""
    return max(assets, key=lambda a: a.width or 0) if assets else None


def rank_by_score(assets: list[RawAsset]) -> RawAsset | None:
    """Pick the highest-scored asset."""
    return max(assets, key=lambda a: a.score or 0) if assets else None


def rank_logo_by_style(assets: list[RawAsset]) -> RawAsset | None:
    """Rank logos: official > white > custom > black, then by score.

    Black logos are invisible on Otix's dark UI, so they rank last even though
    SteamGridDB labels them as a first-class style.
    """
    return _rank_by_attribute(assets, {"official": 0, "white": 1, "custom": 2, "black": 3})


def rank_grid_by_style(assets: list[RawAsset]) -> RawAsset | None:
    """Rank grids: no_logo (textless) > material > other, then by score."""
    return _rank_by_attribute(assets, {"no_logo": 0, "material": 1})


def rank_hero_by_style(assets: list[RawAsset]) -> RawAsset | None:
    """Rank heroes: material > blurred. Excludes alternate (has text overlay)."""
    candidates = [a for a in assets if a.style in ("material", "blurred")]
    if not candidates:
        return None
    return _rank_by_attribute(candidates, {"material": 0, "blurred": 1})


def rank_icon_by_style(assets: list[RawAsset]) -> RawAsset | None:
    """Rank icons: official > custom. PNG preferred over ICO."""
    # 0.5 bonus for PNG within same style rank
    def _effective_rank(a: RawAsset) -> float:
        style_rank = {"official": 0, "custom": 1}
        rank = style_rank.get(a.style or "", 2)
        is_png = a.url.lower().endswith(".png") if a.url else False
        return rank - 0.5 if is_png else rank

    best = None
    best_rank = 999.0
    best_score = -1
    for a in assets:
        r = _effective_rank(a)
        s = a.score or 0
        if r < best_rank or (r == best_rank and s > best_score):
            best_rank = r
            best_score = s
            best = a
    return best


def rank_english_logo_by_width(assets: list[RawAsset]) -> RawAsset | None:
    """Prefer English logos, then fall back to widest."""
    en = [a for a in assets if a.lang == "en"]
    pool = en or assets
    return max(pool, key=lambda a: a.width or 0) if pool else None


def rank_textless_poster(assets: list[RawAsset]) -> RawAsset | None:
    """Pick the widest poster with a textless language marker."""
    textless_langs = {None, "", "0", "00", "zxx"}
    textless = [a for a in assets if a.lang in textless_langs]
    return max(textless, key=lambda a: a.width or 0) if textless else None


def _rank_by_attribute(
    assets: list[RawAsset],
    style_rank: dict[str, int],
) -> RawAsset | None:
    if not assets:
        return None
    best = None
    best_rank = 999
    best_score = -1
    for a in assets:
        r = style_rank.get(a.style or "", 999)
        s = a.score or 0
        if r < best_rank or (r == best_rank and s > best_score):
            best_rank = r
            best_score = s
            best = a
    return best


# ── Asset store fields per type ────────────────────────────────────────
# Maps asset_type → (media_item_field, ranker, always_overwrite)

DEFAULT_PROMOTION_RULES: dict[str, tuple[str, PromotionRanker, bool]] = {
    "logo":            ("logo_url", rank_english_logo_by_width, False),
    "textless_poster": ("textless_poster_url", rank_textless_poster, False),
    "icon":            ("icon_url", rank_icon_by_style, False),
    "backdrop":        ("backdrop_url", rank_by_width, False),
    "poster":          ("poster_url", rank_by_width, False),
}

# Per-media-type overrides
MEDIA_TYPE_PROMOTION_RULES: dict[str, dict[str, tuple[str, PromotionRanker, bool]]] = {
    "game": {
        "logo":            ("logo_url", rank_logo_by_style, False),
        "textless_poster": ("textless_poster_url", rank_grid_by_style, False),
        "icon":            ("icon_url", rank_icon_by_style, False),
        "backdrop":        ("backdrop_url", rank_hero_by_style, True),  # Always overwrite for games
        "poster":          ("poster_url", rank_by_score, False),
    },
}


# ── AssetPipeline ──────────────────────────────────────────────────────


class AssetPipeline:
    """Shared asset storage and promotion logic.

    Hydrators delegate to this instead of duplicating the store+promote
    flow. Methods are idempotent — safe to call on re-sync.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def store(self, media_item_id: str, assets: list[RawAsset]) -> int:
        """Insert new MediaAsset rows, skipping existing (item, URL, type).

        Race-safe: a single bulk INSERT ... ON CONFLICT DO NOTHING against the
        (media_item_id, url, asset_type) unique index, so concurrent hydrations
        of the same asset can't raise IntegrityError and roll back the batch.
        The same URL may repeat for one item under different asset types (e.g.
        a SteamGridDB grid stored as both ``poster`` and ``textless_poster``).

        Returns the number of new rows added.
        """
        if not assets:
            return 0

        rows = [
            {
                "media_item_id": media_item_id,
                "asset_type": a.asset_type,
                "url": a.url,
                "width": a.width,
                "height": a.height,
                "lang": a.lang,
                "style": a.style,
                "label": a.label,
                "score": a.score,
                "provider": a.provider,
            }
            for a in assets
        ]

        # Existing rows are left untouched except for a missing ``lang``: a re-hydration
        # with the same URLs backfills the language marker (the original seed often ran
        # before a provider captured it) without clobbering anything already known.
        excluded = pg_insert(MediaAsset).excluded
        result = await self.session.execute(
            pg_insert(MediaAsset)
            .values(rows)
            .on_conflict_do_update(
                index_elements=["media_item_id", "url", "asset_type"],
                set_={"lang": excluded.lang},
                where=(MediaAsset.lang.is_(None) | (MediaAsset.lang == "")),
            )
        )
        if result.rowcount:
            # New rows change the selection pool — drop the cached pick so the
            # next query recomputes. A Redis outage must not break hydration.
            try:
                from otix.infrastructure.redis import get_redis
                from otix.services.asset_selection import invalidate_asset_selection

                await invalidate_asset_selection(await get_redis(), media_item_id)
            except Exception:
                pass
        return result.rowcount

    async def promote(
        self,
        media_item: MediaItem,
        field: str,
        candidates: list[RawAsset],
        ranker: PromotionRanker,
        *,
        always_overwrite: bool = False,
        protected: set[str] | None = None,
    ) -> bool:
        """Rank the best candidate; never writes the MediaItem column.

        Best-asset selection happens at query time (asset_selection), so this
        only flags admin-protected fields: when a protected type would get a
        different asset than the admin's override, a system proposal is created
        for review. ``always_overwrite`` is retained for API compat but is a
        no-op now that columns are not written.

        Returns True if the field was updated (always False today).
        """
        if not candidates:
            return False

        best = ranker(candidates)
        if best is None:
            return False

        # Admin protection: flag protected types whose best candidate differs
        # from the admin's locked-in override URL.
        from otix.services.admin_edit_service import AdminEditService

        if protected is None:
            protected = await AdminEditService.get_protected_image_types(
                self.session, media_item.id
            )
        field_type = field.removesuffix("_url")  # "logo_url" → "logo"
        if field_type in protected:
            svc = AdminEditService(self.session)
            overrides = await svc.get_image_overrides_for_media(media_item.id)
            current = overrides.get(field_type, {}).get("*")
            if current is not None and current != best.url:
                await svc.create_system_proposal_for_image(
                    media_item.id, field_type, best.url,
                )

        return False

    async def promote_all(
        self,
        media_item: MediaItem,
        asset_map: dict[str, list[RawAsset]],
        *,
        rules: dict[str, tuple[str, PromotionRanker, bool]] | None = None,
        media_type: str | None = None,
    ) -> dict[str, bool]:
        """Promote multiple asset types at once.

        Args:
            media_item: The item to promote assets onto.
            asset_map: {asset_type: [RawAsset, ...]}
            rules: Override rules per asset type. Falls back to type-specific
                   or default rules when omitted.
            media_type: Media type for rules lookup (game, movie, show, music).

        Returns:
            {asset_type: was_updated} — always False now that columns are not
            written; selection happens at query time.
        """
        if rules is None:
            rules = dict(DEFAULT_PROMOTION_RULES)
            # Apply media-type-specific overrides
            mt_rules = MEDIA_TYPE_PROMOTION_RULES.get(media_type or "", {})
            rules.update(mt_rules)

        from otix.services.admin_edit_service import AdminEditService

        protected = await AdminEditService.get_protected_image_types(
            self.session, media_item.id
        )

        results: dict[str, bool] = {}
        for asset_type, candidates in asset_map.items():
            if not candidates:
                continue
            rule = rules.get(asset_type)
            if rule is None:
                continue
            field, ranker, always = rule
            results[asset_type] = await self.promote(
                media_item,
                field,
                candidates,
                ranker,
                always_overwrite=always,
                protected=protected,
            )
        return results
