"""The Movie Database (TMDB) Provider package.

Provides client, transformers, hydrators, and manifest registration for TMDB.
"""

from __future__ import annotations

from core.providers.framework import (
    ProviderCapability,
    ProviderManifest,
    register_provider,
)
from core.providers.tmdb.client import (
    TMDBProvider,
    _shared_client,
    _shared_client_loop_id,
    close_http_client,
    get_http_client,
)
from core.providers.tmdb.hydrators import (
    seed_episodes_from_season,
    seed_movie_from_tmdb,
    seed_season_from_tmdb,
    seed_show_from_tmdb,
)
from core.providers.tmdb.transformers import (
    transform_episode,
    transform_movie,
    transform_season,
    transform_show,
)

manifest = ProviderManifest(
    id="tmdb",
    name="The Movie Database",
    capabilities=(
        ProviderCapability.METADATA
        | ProviderCapability.ARTWORK
        | ProviderCapability.WATCH_PROVIDERS
    ),
    supported_media_types=("movie", "show"),
)

register_provider(manifest, client_cls=TMDBProvider)

__all__ = [
    "manifest",
    "TMDBProvider",
    "get_http_client",
    "close_http_client",
    "transform_movie",
    "transform_show",
    "transform_season",
    "transform_episode",
    "seed_movie_from_tmdb",
    "seed_show_from_tmdb",
    "seed_season_from_tmdb",
    "seed_episodes_from_season",
    "_shared_client",
    "_shared_client_loop_id",
]
