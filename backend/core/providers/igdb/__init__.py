"""Internet Game Database (IGDB) provider package.

Follows the Otix Provider Integration Framework architecture.
"""

from __future__ import annotations

from core.providers.framework import (
    ProviderCapability,
    ProviderManifest,
    register_provider,
)
from core.providers.igdb.auth import (
    OAUTH_URL,
    TOKEN_KEY,
    IGDBAuthError,
)
from core.providers.igdb.client import (
    IGDBError,
    IGDBProvider,
    close_http_client,
    get_http_client,
)
from core.providers.igdb.hydrators import seed_game_from_igdb
from core.providers.igdb.schemas import GAME_FIELDS, SEARCH_FIELDS
from core.providers.igdb.transformers import transform_game

manifest = ProviderManifest(
    id="igdb",
    name="Internet Game Database",
    capabilities=ProviderCapability.METADATA | ProviderCapability.ARTWORK,
    supported_media_types=("game",),
    description="IGDB (Internet Game Database) video game metadata and artwork provider.",
)

register_provider(manifest, client_cls=IGDBProvider)

__all__ = [
    "manifest",
    "IGDBProvider",
    "IGDBError",
    "IGDBAuthError",
    "get_http_client",
    "close_http_client",
    "transform_game",
    "seed_game_from_igdb",
    "OAUTH_URL",
    "TOKEN_KEY",
    "GAME_FIELDS",
    "SEARCH_FIELDS",
]
