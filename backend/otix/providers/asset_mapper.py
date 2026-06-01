"""Provider → Otix asset type mapping.

Each provider uses its own vocabulary for asset types (IGDB calls posters
"cover", backdrops "artwork", etc.). This module normalises them to Otix
standard types so consumers don't need provider-specific knowledge.
"""

from __future__ import annotations

# Standard Otix asset types used across all providers.
# New providers should map into this vocabulary.
OTIX_ASSET_TYPES = frozenset({
    "poster",
    "textless_poster",
    "backdrop",
    "logo",
    "icon",
    "banner",
    "clearart",
    "thumb",
    "disc",
    "screenshot",
})

# Per-provider mappings: {provider_raw_type: otix_standard_type}
_PROVIDER_MAPS: dict[str, dict[str, str]] = {
    "igdb": {
        "cover":        "poster",
        "screenshot":   "screenshot",
        "artwork":      "backdrop",
    },
    # Fanart, SteamGridDB, TMDB, and most others already use Otix-standard
    # names so they don't need explicit mappings — the identity pass-through
    # in map_asset_type handles them.
}


def map_asset_type(provider: str, raw_type: str) -> str:
    """Convert a provider-specific asset type to an Otix standard type.

    Returns the raw_type unchanged if no mapping is defined (identity pass-through).
    """
    pmap = _PROVIDER_MAPS.get(provider, {})
    return pmap.get(raw_type, raw_type)
