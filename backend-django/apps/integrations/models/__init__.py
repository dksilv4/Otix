"""Integrations models: provider sync + per-user plex/steam/youtube state.

One module per provider concern:
- ``sync``:   SyncJob + ProviderState (job/cursor machinery)
- ``plex``:   user Plex servers/libraries/scanned items
- ``steam``:  user Steam owned games + wishlist
- ``youtube``: user YouTube liked videos
"""

from apps.integrations.models.plex import (
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
)
from apps.integrations.models.steam import UserSteamGame, UserSteamWishlist
from apps.integrations.models.sync import ProviderState, SyncJob
from apps.integrations.models.youtube import UserYoutubeLikedVideo

__all__ = [
    "ProviderState",
    "SyncJob",
    "UserPlexItem",
    "UserPlexLibrary",
    "UserPlexServer",
    "UserSteamGame",
    "UserSteamWishlist",
    "UserYoutubeLikedVideo",
]
