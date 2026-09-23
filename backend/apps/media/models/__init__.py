"""Media catalog models.

The catalog hub every other domain app FKs to. One module per aggregate:
- ``media_item``: MediaItem hub + Movie/Show/Season/Episode/Game subtypes
- ``asset``:      assets / videos / releases / external ratings
- ``genre``:      genres + genre_media_types, keywords + media links
- ``franchise``:  franchises + franchise_items
- ``platform``:   platforms/game-modes + media links
- ``watch_provider``: watch providers + media links
- ``external_id``: polymorphic ExternalID registry (GenericForeignKey)
"""

from apps.media.models.asset import (
    ExternalRating,
    MediaAsset,
    MediaRelease,
    MediaVideo,
)
from apps.media.models.character import Character, CharacterAsset, MediaCharacter
from apps.media.models.external_id import ExternalID
from apps.media.models.franchise import Franchise, FranchiseItem
from apps.media.models.genre import (
    Genre,
    Keyword,
    MediaGenre,
    MediaGenreType,
    MediaKeyword,
)
from apps.media.models.media_item import (
    Episode,
    Game,
    MediaItem,
    Movie,
    Season,
    Show,
)
from apps.media.models.platform import GameMode, MediaGameMode, MediaPlatform, Platform
from apps.media.models.setting import MediaServerSetting
from apps.media.models.watch_provider import MediaWatchProvider, WatchProvider

__all__ = [
    "Character",
    "CharacterAsset",
    "Episode",
    "ExternalID",
    "ExternalRating",
    "Franchise",
    "FranchiseItem",
    "Game",
    "GameMode",
    "Genre",
    "Keyword",
    "MediaAsset",
    "MediaCharacter",
    "MediaGameMode",
    "MediaGenre",
    "MediaGenreType",
    "MediaItem",
    "MediaKeyword",
    "MediaPlatform",
    "MediaRelease",
    "MediaServerSetting",
    "MediaVideo",
    "MediaWatchProvider",
    "Movie",
    "Platform",
    "Season",
    "Show",
    "WatchProvider",
]
