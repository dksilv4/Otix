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

from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy import select
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
    """Rank logos: official > white > black > custom, then by score."""
    return _rank_by_attribute(assets, {"official": 0, "white": 1, "black": 2, "custom": 3})


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
        """Insert new MediaAsset rows, skipping existing URLs.

        Returns the number of new rows added.
        """
        if not assets:
            return 0

        urls = {a.url for a in assets}
        existing = set(
            (await self.session.scalars(
                select(MediaAsset.url).where(MediaAsset.url.in_(urls))
            )).all()
        )

        added = 0
        for a in assets:
            if a.url in existing:
                continue
            self.session.add(
                MediaAsset(
                    media_item_id=media_item_id,
                    asset_type=a.asset_type,
                    url=a.url,
                    width=a.width,
                    height=a.height,
                    lang=a.lang,
                    style=a.style,
                    score=a.score,
                    provider=a.provider,
                )
            )
            added += 1

        if added:
            await self.session.flush()

        return added

    async def promote(
        self,
        media_item: MediaItem,
        field: str,
        candidates: list[RawAsset],
        ranker: PromotionRanker,
        *,
        always_overwrite: bool = False,
    ) -> bool:
        """Select the best candidate and set it on the MediaItem field.

        Checks admin image protection before overwriting. When a field is
        protected and a different URL would be chosen, creates a system
        proposal instead.

        Returns True if the field was updated.
        """
        if not candidates:
            return False

        best = ranker(candidates)
        if best is None:
            return False

        current = getattr(media_item, field, None)
        if not always_overwrite and current is not None and current != best.url:
            # Existing value takes priority — keep it
            return False

        if current == best.url:
            return False  # No change

        # Check admin protection
        from otix.services.admin_edit_service import AdminEditService

        protected = await AdminEditService.get_protected_image_types(
            self.session, media_item.id
        )
        field_type = field.removesuffix("_url")  # "logo_url" → "logo"
        if field_type in protected and current is not None:
            svc = AdminEditService(self.session)
            await svc.create_system_proposal_for_image(
                media_item.id, field_type, best.url,
            )
            return False

        setattr(media_item, field, best.url)
        return True

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
            {asset_type: was_updated}
        """
        if rules is None:
            rules = dict(DEFAULT_PROMOTION_RULES)
            # Apply media-type-specific overrides
            mt_rules = MEDIA_TYPE_PROMOTION_RULES.get(media_type or "", {})
            rules.update(mt_rules)

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
            )
        return results
