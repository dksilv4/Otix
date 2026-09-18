"""Integrations domain services, re-exported for convenient imports."""

from apps.integrations.services.epic import scan_epic_library
from apps.integrations.services.plex import (
    DISCOVER_UNEXPECTED,
    PlexAlbumTracksFetchError,
    PlexConnectInfoNotFound,
    PlexDiscoveryAuthRevoked,
    PlexDiscoveryConnectError,
    PlexDiscoveryError,
    PlexDiscoveryHttpError,
    PlexDiscoveryTimeout,
    PlexNoLinkedAccount,
    discover_plex_libraries,
    discover_plex_servers,
    get_plex_album_tracks,
    get_plex_connect_info,
    get_plex_sessions,
    get_plex_stream_url,
    list_plex_libraries,
    resolve_stream_url_for_server_with_base,
)
from apps.integrations.services.plex_watchlist import sync_plex_watchlist
from apps.integrations.services.steam import scan_steam_library, scan_steam_wishlist
from apps.integrations.services.steam_igdb import resolve_unmatched_steam_games
from apps.integrations.services.sync import (
    enqueue_sync_job,
    execute_sync_job,
    get_sync_engine,
    register_sync_engine,
)
from apps.integrations.services.tmdb import import_tmdb_watchlist, sync_tmdb_ratings

__all__ = [
    "DISCOVER_UNEXPECTED",
    "PlexAlbumTracksFetchError",
    "PlexConnectInfoNotFound",
    "PlexDiscoveryAuthRevoked",
    "PlexDiscoveryConnectError",
    "PlexDiscoveryError",
    "PlexDiscoveryHttpError",
    "PlexDiscoveryTimeout",
    "PlexNoLinkedAccount",
    "discover_plex_libraries",
    "discover_plex_servers",
    "enqueue_sync_job",
    "execute_sync_job",
    "get_sync_engine",
    "get_plex_album_tracks",
    "get_plex_connect_info",
    "get_plex_sessions",
    "get_plex_stream_url",
    "list_plex_libraries",
    "resolve_stream_url_for_server_with_base",
    "import_tmdb_watchlist",
    "register_sync_engine",
    "resolve_unmatched_steam_games",
    "scan_epic_library",
    "scan_steam_library",
    "scan_steam_wishlist",
    "sync_plex_watchlist",
    "sync_tmdb_ratings",
]
