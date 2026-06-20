# TODO: Review this file
"""SQLAlchemy ORM models ONLY.

RULES:
- No business logic beyond simple property accessors.
- No async/await in model methods.
- Must NOT import from services, api, tasks, or providers.
- This package is the leaf — it depends on nothing internal.
"""

from otix.domain.admin_edit import MediaEditProposal, MediaImageOverride, ProposalVote
from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.collection import Collection, CollectionItem
from otix.domain.company import Company, InvolvedCompany
from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.follow import Follow, FollowRequest, FollowRequestStatus
from otix.domain.franchise import Franchise, FranchiseItem
from otix.domain.friend import FriendRequest
from otix.domain.genre import Genre, Keyword, MediaGenre, MediaKeyword
from otix.domain.interaction import UserMediaInteraction
from otix.domain.karma_transaction import KarmaTransaction
from otix.domain.list import ListItemRankHistory, MediaListCollaborator, MediaListLike, UserList, UserListItem
from otix.domain.media import (
    Album,
    Episode,
    ExternalID,
    Game,
    MatchSkip,
    GameMode,
    GameSaveOfficialPath,
    GameSavePathSuggestion,
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
from otix.domain.media_rating import MediaItemRating
from otix.domain.mood import UserMoodCheckIn
from otix.domain.notification import Notification
from otix.domain.people import MediaCredit, Person, UserPersonFollow
from otix.domain.review import Review
from otix.domain.review_vote import ReviewVote
from otix.domain.search_log import SearchLog
from otix.domain.sync import ProviderState, SyncJob
from otix.domain.user import AuthActionToken, RefreshToken, User, UserRating, UserSession
from otix.domain.user_badge import UserBadge
from otix.domain.user_streak import UserStreak
from otix.domain.watch_provider import MediaWatchProvider, WatchProvider
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
    "Franchise",
    "FranchiseItem",
    "Follow",
    "FollowRequest",
    "FollowRequestStatus",
    "FriendRequest",
    "Game",
    "GameMode",
    "GameSaveOfficialPath",
    "GameSavePathSuggestion",
    "Genre",
    "InvolvedCompany",
    "KarmaTransaction",
    "Keyword",
    "ListItemRankHistory",
    "MediaListCollaborator",
    "MediaListLike",
    "MatchSkip",
    "MediaAsset",
    "MediaCredit",
    "MediaEditProposal",
    "MediaImageOverride",
    "ProposalVote",
    "MediaGameMode",
    "MediaGenre",
    "MediaItem",
    "MediaItemRating",
    "MediaKeyword",
    "MediaPlatform",
    "MediaRelease",
    "MediaVideo",
    "MediaWatchProvider",
    "Movie",
    "Notification",
    "Person",
    "Platform",
    "ProviderState",
    "RefreshToken",
    "Review",
    "ReviewVote",
    "SearchLog",
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
    "UserEpisodeInteraction",
    "UserMediaInteraction",
    "UserPersonFollow",
    "UserPlexItem",
    "UserPlexLibrary",
    "UserPlexServer",
    "UserSteamGame",
    "UserStreak",
    "WatchProvider",
    "Workout",
    "WorkoutExercise",
]
