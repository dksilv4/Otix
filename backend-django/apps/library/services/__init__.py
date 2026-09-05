"""Library domain read services, re-exported for convenient imports."""

from apps.library.services.installed import get_installed_games
from apps.library.services.plex import (
    PlexThumbError,
    get_plex_library,
    get_plex_status,
    get_plex_thumb_url,
)
from apps.library.services.steam import (
    get_steam_library,
    get_steam_status,
    get_steam_wishlist,
    get_unmatched_steam_games,
)
from apps.library.services.summaries import build_media_item_summary, enrich_media_items
from apps.library.services.tabs import (
    UNKNOWN_TAB_DETAIL,
    get_library_tab,
    resolve_interaction_type,
)
from apps.library.services.youtube import get_youtube_library

__all__ = [
    "PlexThumbError",
    "UNKNOWN_TAB_DETAIL",
    "build_media_item_summary",
    "enrich_media_items",
    "get_installed_games",
    "get_library_tab",
    "get_plex_library",
    "get_plex_status",
    "get_plex_thumb_url",
    "get_steam_library",
    "get_steam_status",
    "get_steam_wishlist",
    "get_unmatched_steam_games",
    "get_youtube_library",
    "resolve_interaction_type",
]
