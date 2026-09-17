"""Social domain models (user graph, reviews, interactions, notifications).

Ported from the legacy FastAPI domain modules under ``old-backend/otix/domain/``.
One module per concern:
- ``graph``:  friend requests + the user-to-user follow graph
- ``review``: text reviews + up/down votes
- ``interaction``: per-user media-item and episode interactions
- ``rating``:  per-user 1-10 media ratings
- ``notification``: in-app notifications
- ``gamification``: badges, streaks, karma, mood check-ins
"""

from apps.social.models.gamification import (
    KarmaTransaction,
    UserBadge,
    UserMoodCheckIn,
    UserStreak,
)
from apps.social.models.graph import Follow, FollowRequest, FriendRequest
from apps.social.models.interaction import (
    UserEpisodeInteraction,
    UserMediaInteraction,
)
from apps.social.models.notification import Notification
from apps.social.models.rating import MediaItemRating
from apps.social.models.review import Review, ReviewVote

__all__ = [
    "Follow",
    "FollowRequest",
    "FriendRequest",
    "KarmaTransaction",
    "MediaItemRating",
    "Notification",
    "Review",
    "ReviewVote",
    "UserBadge",
    "UserEpisodeInteraction",
    "UserMediaInteraction",
    "UserMoodCheckIn",
    "UserStreak",
]
