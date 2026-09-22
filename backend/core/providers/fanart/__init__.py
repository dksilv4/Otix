"""Fanart.tv Provider package.

Provides client, transformers, hydrators, and manifest registration for Fanart.tv.
"""

from __future__ import annotations

from core.providers.fanart.client import (
    BASE_URL,
    FanartError,
    FanartProvider,
    _shared_client,
    _shared_client_loop_id,
    close_http_client,
    get_http_client,
)
from core.providers.fanart.hydrators import (
    fanart_enrich_images,
    hydrate_normalized_assets,
)
from core.providers.fanart.transformers import (
    MOVIE_CATEGORIES,
    SHOW_CATEGORIES,
    fanart_asset_specs,
    transform_fanart_assets,
    transform_movie_assets,
    transform_show_assets,
)
from core.providers.framework import (
    ProviderCapability,
    ProviderManifest,
    register_provider,
)

MANIFEST = ProviderManifest(
    id="fanart",
    name="Fanart.tv",
    capabilities=ProviderCapability.ARTWORK,
    supported_media_types=("movie", "show"),
    description=(
        "Community-contributed supplementary artwork, transparent logos, "
        "backdrops, and textless posters."
    ),
)

register_provider(MANIFEST, FanartProvider)

__all__ = [
    "MANIFEST",
    "BASE_URL",
    "FanartProvider",
    "FanartError",
    "get_http_client",
    "close_http_client",
    "_shared_client",
    "_shared_client_loop_id",
    # Transformers
    "transform_fanart_assets",
    "transform_movie_assets",
    "transform_show_assets",
    "fanart_asset_specs",
    "MOVIE_CATEGORIES",
    "SHOW_CATEGORIES",
    # Hydrators
    "fanart_enrich_images",
    "hydrate_normalized_assets",
]
