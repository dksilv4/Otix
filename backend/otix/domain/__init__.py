"""SQLAlchemy ORM models ONLY.

RULES:
- No business logic beyond simple property accessors.
- No async/await in model methods.
- Must NOT import from services, api, tasks, or providers.
- This package is the leaf — it depends on nothing internal.
"""

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.collection import Collection, CollectionItem
from otix.domain.genre import Genre, Keyword, MediaGenre, MediaKeyword
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import Episode, ExternalID, Game, MediaItem, Movie, Season, Show
from otix.domain.people import MediaCredit, Person
from otix.domain.sync import ProviderState, SyncJob
from otix.domain.user import RefreshToken, User

__all__ = [
    "Collection",
    "CollectionItem",
    "Episode",
    "ExternalID",
    "ExternalRating",
    "Game",
    "Genre",
    "Keyword",
    "MediaAsset",
    "MediaCredit",
    "MediaGenre",
    "MediaItem",
    "MediaKeyword",
    "MediaRelease",
    "MediaVideo",
    "Movie",
    "Person",
    "ProviderState",
    "RefreshToken",
    "Season",
    "Show",
    "SyncJob",
    "User",
    "UserMediaInteraction",
]
