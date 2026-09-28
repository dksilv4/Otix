"""Store providers package."""

from apps.freegames.services.providers.epic import EpicFreeGamesProvider
from apps.freegames.services.providers.steam import SteamFreeGamesProvider

__all__ = ["EpicFreeGamesProvider", "SteamFreeGamesProvider"]
