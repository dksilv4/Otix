"""SQLAlchemy ORM models ONLY.

RULES:
- No business logic beyond simple property accessors.
- No async/await in model methods.
- Must NOT import from services, api, tasks, or providers.
- This package is the leaf — it depends on nothing internal.
"""

from otix.domain.admin_edit import MediaEditProposal, MediaImageOverride
from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.collection import Collection, CollectionItem
from otix.domain.company import Company, InvolvedCompany

from otix.domain.genre import Genre, Keyword, MediaGenre, MediaKeyword
from otix.domain.interaction import UserMediaInteraction
from otix.domain.list import ListItemRankHistory, MediaListCollaborator, MediaListLike, UserList, UserListItem
from otix.domain.review import Review
from otix.domain.media import (
    Album,
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
    Track,
    TrackRating,
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
)
from otix.domain.mood import UserMoodCheckIn
from otix.domain.people import MediaCredit, Person
from otix.domain.sync import ProviderState, SyncJob
from otix.domain.follow import Follow
from otix.domain.friend import FriendRequest
from otix.domain.karma_transaction import KarmaTransaction
from otix.domain.notification import Notification
from otix.domain.review_vote import ReviewVote
from otix.domain.user import AuthActionToken, RefreshToken, User, UserRating, UserSession
from otix.domain.user_badge import UserBadge
from otix.domain.user_streak import UserStreak
from otix.domain.workout import Exercise, Workout, WorkoutExercise

__all__ = [
    "Album",
    "AuthActionToken",
    "Collection",
    "CollectionItem",
    "Company",
    "Episode",
    "Exercise",
    "ExternalID",
    "ExternalRating",
    "Follow",
    "FriendRequest",
    "Game",
    "GameMode",
    "Genre",
    "InvolvedCompany",
    "KarmaTransaction",
    "Keyword",
    "ListItemRankHistory",
    "MediaListCollaborator",
    "MediaListLike",
    "MediaAsset",
    "MediaCredit",
    "MediaEditProposal",
    "MediaImageOverride",
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
    "ReviewVote",
    "Season",
    "Show",
    "SyncJob",
    "Track",
    "TrackRating",
    "User",
    "UserBadge",
    "UserMoodCheckIn",
    "UserList",
    "UserListItem",
    "UserRating",
    "UserSession",
    "UserMediaInteraction",
    "UserPlexItem",
    "UserPlexLibrary",
    "UserPlexServer",
    "UserSteamGame",
    "UserStreak",
    "Workout",
    "WorkoutExercise",
]
