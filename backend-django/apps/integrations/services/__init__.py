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
    list_plex_libraries,
)

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
    "list_plex_libraries",
]
