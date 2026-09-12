"""Django admin registration for social-domain models."""

from django.contrib import admin

from apps.social.models import (
    Follow,
    FollowRequest,
    FriendRequest,
    KarmaTransaction,
    MediaItemRating,
    Notification,
    Review,
    ReviewVote,
    UserBadge,
    UserEpisodeInteraction,
    UserMediaInteraction,
    UserMoodCheckIn,
    UserStreak,
)

MODELS = [
    Follow,
    FollowRequest,
    FriendRequest,
    KarmaTransaction,
    MediaItemRating,
    Notification,
    Review,
    ReviewVote,
    UserBadge,
    UserEpisodeInteraction,
    UserMediaInteraction,
    UserMoodCheckIn,
    UserStreak,
]

for model in MODELS:
    admin.site.register(model, admin.ModelAdmin)
