"""Integrations models: provider sync + per-user plex/steam/youtube state.

One module per provider concern:
- ``sync``:   SyncJob + ProviderState (job/cursor machinery)
- ``client``: ClientDevice (registered fetch-proxy devices)
- ``plex``:   user Plex servers/libraries/scanned items
- ``steam``:  user Steam owned games + wishlist
- ``epic``:   user Epic owned games
- ``youtube``: user YouTube liked videos
"""

from apps.integrations.models.client import ClientDevice
from apps.integrations.models.epic import UserEpicGame
from apps.integrations.models.plex import (
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
)
from apps.integrations.models.steam import UserSteamGame, UserSteamWishlist
from apps.integrations.models.sync import ProviderState, SyncJob
from apps.integrations.models.youtube import UserYoutubeLikedVideo

__all__ = [
    "ClientDevice",
    "ProviderState",
    "SyncJob",
    "UserPlexItem",
    "UserPlexLibrary",
    "UserPlexServer",
    "UserEpicGame",
    "UserSteamGame",
    "UserSteamWishlist",
    "UserYoutubeLikedVideo",
]
