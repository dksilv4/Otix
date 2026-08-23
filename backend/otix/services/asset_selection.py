"""Query-time asset selection.

``media_assets`` is the single source of truth for all artwork. Hydration only
stores rows (typed + labelled); it never bakes a "best pick" anywhere. This
service resolves the best URL per asset type at query time, ranking stored
assets by label preference → community score → dimensions, honouring admin
overrides first, and caching the result in Redis so repeated queries skip the
ranking work.

Admin overrides (``media_image_overrides``) always win — checked before any
cache/DB path so adding or removing an override is honoured immediately.
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.admin_edit import MediaImageOverride
from otix.domain.asset import MediaAsset

ITEM_CACHE_KEY = "asset:sel:v5:{item_id}:{lang}:{theme}"
CACHE_TTL = 3600  # 1 hour

# The selected logo's color_guess, surfaced so the frontend can apply a CSS
# contrast fix (invert) when a monochrome logo mismatches the viewer theme.
LOGO_COLOR_FIELD = "logo_color_guess"

# asset_type → schema field suffix
FIELD_SUFFIX = {
    "poster": "poster_url",
    "backdrop": "backdrop_url",
    "logo": "logo_url",
    "textless_poster": "textless_poster_url",
    "icon": "icon_url",
}
RESOLVE_TYPES = tuple(FIELD_SUFFIX)

# Lower index = preferred. Labels not listed rank last (999).
# Prefer textless, logo-free, material, and alternate artwork over official covers with logos.
_POSTER_PREF = {
    "textless": 0,
    "no_logo": 0,
    "material": 1,
    "clean": 1,
    "alternate": 2,
    "official": 3,
    "white_logo": 4,
    "white": 5,
}
_BACKDROP_PREF = {"material": 0, "clean": 1, "official": 2, "blurred": 3}
_LOGO_PREF = {"multicolor": 0, "official": 0, "white": 1, "custom": 2, "black": 3}
# colour_guess contrast rank per viewer theme. Dark UI prefers light logos; light
# UI prefers dark logos. Unknown (no analysis yet) sits mid so un-analysed logos
# still compete on label/score instead of being pushed to the back.
_LOGO_THEME_PREF: dict[str, dict[str | None, int]] = {
    "dark": {"guess_white": 0, "guess_colorful": 1, "guess_multicolor": 2, None: 2, "guess_gray": 3, "guess_black": 4},
    "light": {"guess_black": 0, "guess_colorful": 1, "guess_multicolor": 2, None: 2, "guess_gray": 3, "guess_white": 4},
}
# textless_poster is only allowed to be a genuinely textless asset. SteamGridDB
# "material" grids and "white_logo" posters still have the game logo baked in, so
# they are excluded — when nothing textless exists, _resolve_from_db falls back to
# the backdrop (background art with no text) so cards never show a logo poster.
_TEXTLESS_PREF = {"textless": 0, "no_logo": 0}
_TEXTLESS_ALLOW = {"textless", "no_logo"}
_ICON_PREF = {"official": 0, "custom": 1}
_LABEL_PREF = {
    "poster": _POSTER_PREF,
    "backdrop": _BACKDROP_PREF,
    "logo": _LOGO_PREF,
    "textless_poster": _TEXTLESS_PREF,
    "icon": _ICON_PREF,
}
# Backdrops with a baked-in title/text overlay look bad behind content.
_BACKDROP_EXCLUDE = {"alternate"}
# Language marker values that mean "no text / textless" (ISO 639 zxx, SGDB "0").
_TEXTLESS_LANGS = {None, "", "0", "00", "zxx"}


def _logo_lang_pref(lang: str | None, preferred: str) -> int:
    """Rank logo language: preferred language first, textless next, localized last.

    SteamGridDB hosts localized logos (ja/ru/ar/...) with the same SGDB style as
    the preferred-language ones, so label/score/width alone can surface a logo
    whose text is in the wrong language. Language is the primary tiebreaker for
    logos; ``preferred`` comes from the viewer's country / explicit preference.
    """
    if lang == preferred:
        return 0
    if lang in _TEXTLESS_LANGS:
        return 1
    return 2


def _select_best(
    assets: list[MediaAsset],
    asset_type: str,
    preferred_lang: str = "en",
    theme: str | None = None,
) -> MediaAsset | None:
    """Pick the best asset from candidates for one type."""
    if not assets:
        return None
    pref = _LABEL_PREF.get(asset_type, {})
    theme_pref = _LOGO_THEME_PREF.get(theme or "", {}) if theme else {}
    exclude = _BACKDROP_EXCLUDE if asset_type == "backdrop" else set()
    # textless_poster must be genuinely textless — never a logo-bearing grid.
    allow = _TEXTLESS_ALLOW if asset_type == "textless_poster" else None
    want_png = asset_type == "icon"
    best: MediaAsset | None = None
    best_key: tuple | None = None
    for a in assets:
        if a.label in exclude:
            continue
        if allow is not None and (a.label or "") not in allow:
            continue
        key = (pref.get(a.label or "", 999), -(a.score or 0), -(a.width or 0))
        if asset_type == "logo":
            if theme:
                # Contrast is the primary signal for logos: one that is invisible on
                # the current theme is worse than a textless/foreign-language one.
                key = (theme_pref.get(a.color_guess, 2), _logo_lang_pref(a.lang, preferred_lang), *key)
            else:
                key = (_logo_lang_pref(a.lang, preferred_lang), *key)
        if want_png and a.url and a.url.lower().endswith(".png"):
            key = (key[0] - 0.5, *key[1:])
        if best_key is None or key < best_key:
            best_key = key
            best = a
    return best


async def invalidate_asset_selection(redis, item_id: str) -> None:
    """Drop cached selections for one item so they recompute on next read.

    Selection is cached per preferred language and viewer theme, so all variants must go.
    """
    pattern = ITEM_CACHE_KEY.format(item_id=item_id, lang="*", theme="*")
    keys = [key async for key in redis.scan_iter(match=pattern, count=100)]
    if keys:
        await redis.delete(*keys)


async def _fetch_overrides(
    session: AsyncSession, item_ids: list[str]
) -> dict[str, dict[str, str]]:
    """Return {media_item_id: {image_type: url}} for active overrides."""
    if not item_ids:
        return {}
    rows = await session.scalars(
        select(MediaImageOverride).where(
            MediaImageOverride.media_item_id.in_(item_ids),
            MediaImageOverride.is_active.is_(True),
        )
    )
    overrides: dict[str, dict[str, str]] = {}
    for o in rows:
        overrides.setdefault(o.media_item_id, {})[o.image_type] = o.url
    return overrides


async def _resolve_from_db(
    session: AsyncSession,
    item_ids: list[str],
    asset_types: tuple[str, ...],
    preferred_lang: str = "en",
    theme: str | None = None,
) -> dict[str, dict[str, str | None]]:
    """Rank stored assets for the given items (one query, no cache)."""
    if not item_ids:
        return {}
    rows = await session.scalars(
        select(MediaAsset).where(
            MediaAsset.media_item_id.in_(item_ids),
            MediaAsset.asset_type.in_(asset_types),
        )
    )
    by_item: dict[str, dict[str, list[MediaAsset]]] = {}
    for a in rows:
        by_item.setdefault(a.media_item_id, {}).setdefault(a.asset_type, []).append(a)

    out: dict[str, dict[str, str | None]] = {}
    for iid in item_ids:
        per: dict[str, str | None] = {}
        item_assets = by_item.get(iid, {})
        for at in asset_types:
            best = _select_best(item_assets.get(at, []), at, preferred_lang=preferred_lang, theme=theme)
            per[FIELD_SUFFIX[at]] = best.url if best is not None else None
            if at == "logo":
                per[LOGO_COLOR_FIELD] = best.color_guess if best is not None else None
        
        # When a textless poster is not explicitly set, fall back to backdrop_url (background art)
        # so discover media cards and 4D logo cards have a clean text-free canvas.
        if not per.get("textless_poster_url") and per.get("backdrop_url"):
            per["textless_poster_url"] = per["backdrop_url"]

        out[iid] = per
    return out


async def resolve_assets(
    session: AsyncSession,
    redis,
    item_ids: list[str],
    asset_types: tuple[str, ...] | None = None,
    *,
    cache_ttl: int = CACHE_TTL,
    preferred_lang: str = "en",
    theme: str | None = None,
) -> dict[str, dict[str, str | None]]:
    """Resolve best asset URL per type for each item.

    Returns ``{item_id: {"poster_url": ..., "logo_url": ..., ...}}``.
    Precedence: admin override → Redis cache → ranked media_assets.
    ``preferred_lang`` (ISO 639-1) favours logos whose text is in the viewer's
    language; ``theme`` ("dark"/"light") prefers logos that contrast with the
    viewer's UI. Both scope the cache so users don't share picks.
    """
    asset_types = asset_types or RESOLVE_TYPES
    item_ids = [str(i) for i in item_ids]
    if not item_ids:
        return {}

    overrides = await _fetch_overrides(session, item_ids)

    # Redis cache (one key per item per language per theme). A Redis outage must
    # not take down the read path — fall back to the DB ranking for every item.
    theme_key = theme or "none"
    keys = [ITEM_CACHE_KEY.format(item_id=i, lang=preferred_lang, theme=theme_key) for i in item_ids]
    result: dict[str, dict[str, str | None]] = {}
    miss_items: list[str] = []
    if keys:
        try:
            cached_vals = await redis.mget(*keys)
        except Exception:
            cached_vals = None
        if cached_vals is not None:
            for item_id, val in zip(item_ids, cached_vals, strict=False):
                if val is not None:
                    try:
                        result[item_id] = json.loads(val)
                    except (ValueError, TypeError):
                        miss_items.append(item_id)
                else:
                    miss_items.append(item_id)
    if not result:
        miss_items = list(item_ids)

    if miss_items:
        db_result = await _resolve_from_db(
            session, miss_items, asset_types, preferred_lang=preferred_lang, theme=theme
        )
        for item_id, per in db_result.items():
            result[item_id] = per
            try:
                await redis.setex(
                    ITEM_CACHE_KEY.format(item_id=item_id, lang=preferred_lang, theme=theme_key),
                    cache_ttl,
                    json.dumps(per),
                )
            except Exception:
                pass  # cache writes must never break reads

    # Admin overrides win over anything cached/ranked.
    for item_id, per in result.items():
        override_map = overrides.get(item_id)
        if override_map:
            for at, suffix in FIELD_SUFFIX.items():
                if at in override_map:
                    per[suffix] = override_map[at]

    return result


ASSET_FIELDS = tuple(FIELD_SUFFIX.values()) + (LOGO_COLOR_FIELD,)


async def enrich_items_with_assets(
    session: AsyncSession,
    items: list,
    *,
    redis=None,
    preferred_lang: str = "en",
    theme: str | None = None,
) -> list:
    """Attach resolved asset URLs to ORM items in-place as ``_resolved_*`` attrs.

    Schemas prefer these via ``model_validator(mode="before")``, so the read
    path no longer depends on the legacy ``media_items`` URL columns.
    ``preferred_lang`` and ``theme`` are passed through to logo selection.
    """
    if not items:
        return items
    if redis is None:
        from otix.infrastructure.redis import get_redis

        redis = await get_redis()
    resolved = await resolve_assets(
        session, redis, [str(i.id) for i in items], preferred_lang=preferred_lang, theme=theme
    )
    for item in items:
        urls = resolved.get(str(item.id), {})
        for suffix in ASSET_FIELDS:
            setattr(item, f"_resolved_{suffix}", urls.get(suffix))
    return items


def resolved_assets_view(obj, fields) -> dict | object:
    """Return a field→value mapping for an ORM object, preferring ``_resolved_*``.

    Used by schema validators: when enrichment has attached resolved asset
    URLs, those win over the (legacy) column values. Otherwise returns the
    object unchanged so ``from_attributes`` behaves as before.
    """
    resolved = {f: getattr(obj, f"_resolved_{f}", None) for f in ASSET_FIELDS}
    if not any(v is not None for v in resolved.values()):
        return obj
    # Only include attributes that actually exist on the object. Fields the ORM
    # lacks (e.g. ``screenshots`` on MediaItem) must stay absent so Pydantic
    # falls back to the schema default instead of an explicit None.
    out = {name: getattr(obj, name) for name in fields if hasattr(obj, name)}
    out.update({f: v for f, v in resolved.items() if v is not None})
    return out
