"""SQLAlchemy ORM models ONLY.

RULES:
- No business logic beyond simple property accessors.
- No async/await in model methods.
- Must NOT import from services, api, tasks, or providers.
- This package is the leaf — it depends on nothing internal.
"""

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.collection import Collection, CollectionItem
from otix.domain.company import Company, InvolvedCompany

from otix.domain.genre import Genre, Keyword, MediaGenre, MediaKeyword
from otix.domain.interaction import UserMediaInteraction
from otix.domain.list import UserList, UserListItem
from otix.domain.review import Review
from otix.domain.media import (
    Episode,
    ExternalID,
    Game,
    GameMode,
    MediaGameMode,
    MediaItem,
    MediaPlatform,
    Movie,
    Platform,
    Season,
    Show,
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
)
from otix.domain.people import MediaCredit, Person
from otix.domain.sync import ProviderState, SyncJob
from otix.domain.friend import FriendRequest
from otix.domain.notification import Notification
from otix.domain.user import AuthActionToken, RefreshToken, User, UserSession
from otix.domain.workout import Exercise, Workout, WorkoutExercise

__all__ = [
    "AuthActionToken",
    "Collection",
    "CollectionItem",
    "Company",

    "Episode",
    "Exercise",
    "ExternalID",
    "ExternalRating",
    "FriendRequest",
    "Game",
    "GameMode",
    "Genre",
    "InvolvedCompany",
    "Keyword",
    "MediaAsset",
    "MediaCredit",
    "MediaGameMode",
    "MediaGenre",
    "MediaItem",
    "MediaKeyword",
    "MediaPlatform",
    "MediaRelease",
    "MediaVideo",
    "Movie",
    "Notification",
    "Person",
    "Platform",
    "ProviderState",
    "RefreshToken",
    "Review",
    "Season",
    "Show",
    "SyncJob",
    "User",
    "UserList",
    "UserListItem",
    "UserSession",
    "UserMediaInteraction",
    "UserPlexItem",
    "UserPlexLibrary",
    "UserPlexServer",
    "UserSteamGame",
    "Workout",
    "WorkoutExercise",
]
