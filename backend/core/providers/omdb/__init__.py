"""OMDb Provider package.

Provides client, transformers, hydrators, and manifest registration for OMDb.
"""

from __future__ import annotations

from core.providers.framework import (
    ProviderCapability,
    ProviderManifest,
    register_provider,
)
from core.providers.omdb.client import (
    BASE_URL,
    OMDbError,
    OMDbProvider,
    _shared_client,
    _shared_client_loop_id,
    close_http_client,
    get_http_client,
)
from core.providers.omdb.hydrators import (
    hydrate_normalized_ratings,
    omdb_enrich_ratings,
    upsert_omdb_ratings,
)
from core.providers.omdb.transformers import (
    parse_score,
    parse_votes,
    rating_specs,
    transform_ratings,
)

MANIFEST = ProviderManifest(
    id="omdb",
    name="Open Movie Database",
    capabilities=ProviderCapability.RATINGS,
    supported_media_types=("movie", "show"),
    description="IMDb, Rotten Tomatoes, and Metacritic audience and critic ratings.",
)

register_provider(MANIFEST, OMDbProvider)

__all__ = [
    "MANIFEST",
    "BASE_URL",
    "OMDbProvider",
    "OMDbError",
    "get_http_client",
    "close_http_client",
    "_shared_client",
    "_shared_client_loop_id",
    # Transformers
    "parse_votes",
    "parse_score",
    "transform_ratings",
    "rating_specs",
    # Hydrators
    "upsert_omdb_ratings",
    "hydrate_normalized_ratings",
    "omdb_enrich_ratings",
]
