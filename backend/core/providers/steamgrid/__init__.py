"""SteamGridDB Provider package.

Provides client, transformers, hydrators, and manifest registration for SteamGridDB.
"""

from __future__ import annotations

from core.providers.framework import (
    ProviderCapability,
    ProviderManifest,
    register_provider,
)
from core.providers.steamgrid.client import (
    BASE_URL,
    SteamGridDBError,
    SteamGridDBProvider,
    _shared_client,
    _shared_client_loop_id,
    close_http_client,
    get_http_client,
)
from core.providers.steamgrid.hydrators import (
    attach_steamgrid_assets,
    fetch_and_attach_game_artwork,
    fetch_and_attach_game_logos,
    hydrate_normalized_assets,
)
from core.providers.steamgrid.transformers import (
    get_asset_type,
    get_style_label,
    transform_assets,
    transform_grid,
    transform_hero,
    transform_icon,
    transform_logo,
)

MANIFEST = ProviderManifest(
    id="steamgrid",
    name="SteamGridDB",
    capabilities=ProviderCapability.ARTWORK,
    supported_media_types=("game",),
    description="Community-sourced game artwork including grids, heroes, logos, and icons.",
)

register_provider(MANIFEST, SteamGridDBProvider)

__all__ = [
    "MANIFEST",
    "BASE_URL",
    "SteamGridDBProvider",
    "SteamGridDBError",
    "get_http_client",
    "close_http_client",
    "_shared_client",
    "_shared_client_loop_id",
    # Transformers
    "transform_grid",
    "transform_hero",
    "transform_logo",
    "transform_icon",
    "transform_assets",
    "get_style_label",
    "get_asset_type",
    # Hydrators
    "attach_steamgrid_assets",
    "hydrate_normalized_assets",
    "fetch_and_attach_game_artwork",
    "fetch_and_attach_game_logos",
]
