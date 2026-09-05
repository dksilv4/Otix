"""Integrations domain services, re-exported for convenient imports."""

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
    "get_plex_album_tracks",
    "get_plex_connect_info",
    "get_plex_sessions",
    "get_plex_stream_url",
    "list_plex_libraries",
    "resolve_stream_url_for_server_with_base",
    "scan_steam_library",
    "scan_steam_wishlist",
    "sync_plex_watchlist",
]
