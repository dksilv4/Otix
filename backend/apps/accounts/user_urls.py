"""Public user-profile routes (``/api/v1/users/``).

Mounted at ``/api/v1/users/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). ``username`` is the string converter
(matches ``accounts.User.username``); ``request_id`` is an integer converter.
Literal routes (``search``, ``achievements``, ``me/...``) are declared before
``<str:username>`` so they are never shadowed.

The users surface spans two domain apps: identity/self/hub reads live in
``accounts``, social-graph/engagement reads+writes (follows, followers,
reviews, karma, badges, mood, activity) live in ``social``. This module imports
view classes from BOTH apps so there is exactly one URL namespace.
"""

from django.urls import path

from apps.accounts.views import (
    ContinueWatchingView,
    UserDetailView,
    UserSearchView,
)
from apps.social.views import (
    AcceptFollowRequestView,
    AchievementsView,
    ActivityHeatmapView,
    ClaimBadgeView,
    DailyActivityView,
    DeclineFollowRequestView,
    FollowCountsView,
    FollowersView,
    FollowingView,
    FollowRequestsView,
    FollowStatusView,
    FriendsActivityView,
    GamingHeartbeatView,
    KarmaTransactionsView,
    KarmaView,
    LibraryStatsView,
    MoodTimelineView,
    RatingDistributionView,
    TopRatedView,
    UserActivityView,
    UserBadgesView,
    UserFollowView,
    UserFriendsView,
    UserHallOfFameView,
    UserRatingView,
    UserReputationView,
    UserReviewsView,
    UserStatsView,
)

app_name = "users"

urlpatterns = [
    # Literal routes (must precede <str:username>).
    path("search", UserSearchView.as_view(), name="user-search"),
    path("achievements", AchievementsView.as_view(), name="achievements"),
    path("me/activity-heatmap", ActivityHeatmapView.as_view(), name="me-activity-heatmap"),
    path("me/continue", ContinueWatchingView.as_view(), name="me-continue"),
    path("me/daily-activity", DailyActivityView.as_view(), name="me-daily-activity"),
    path("me/friends/activity", FriendsActivityView.as_view(), name="me-friends-activity"),
    path(
        "me/badges/<str:badge_key>/claim",
        ClaimBadgeView.as_view(),
        name="me-badge-claim",
    ),
    path(
        "me/gaming-heartbeat",
        GamingHeartbeatView.as_view(),
        name="me-gaming-heartbeat",
    ),
    # Per-username routes.
    path("<str:username>", UserDetailView.as_view(), name="user-detail"),
    path("<str:username>/follow", UserFollowView.as_view(), name="user-follow"),
    path("<str:username>/follow/counts", FollowCountsView.as_view(), name="user-follow-counts"),
    path(
        "<str:username>/follow/requests",
        FollowRequestsView.as_view(),
        name="user-follow-requests",
    ),
    path("<str:username>/follow/status", FollowStatusView.as_view(), name="user-follow-status"),
    path(
        "<str:username>/follow/requests/<int:request_id>/accept",
        AcceptFollowRequestView.as_view(),
        name="user-follow-request-accept",
    ),
    path(
        "<str:username>/follow/requests/<int:request_id>/decline",
        DeclineFollowRequestView.as_view(),
        name="user-follow-request-decline",
    ),
    path("<str:username>/followers", FollowersView.as_view(), name="user-followers"),
    path("<str:username>/following", FollowingView.as_view(), name="user-following"),
    path("<str:username>/friends", UserFriendsView.as_view(), name="user-friends"),
    path("<str:username>/activity", UserActivityView.as_view(), name="user-activity"),
    path("<str:username>/badges", UserBadgesView.as_view(), name="user-badges"),
    path("<str:username>/hall-of-fame", UserHallOfFameView.as_view(), name="user-hall-of-fame"),
    path("<str:username>/karma", KarmaView.as_view(), name="user-karma"),
    path(
        "<str:username>/karma/transactions",
        KarmaTransactionsView.as_view(),
        name="user-karma-transactions",
    ),
    path("<str:username>/library-stats", LibraryStatsView.as_view(), name="user-library-stats"),
    path("<str:username>/mood-timeline", MoodTimelineView.as_view(), name="user-mood-timeline"),
    path("<str:username>/rating", UserRatingView.as_view(), name="user-rating"),
    path(
        "<str:username>/rating-distribution",
        RatingDistributionView.as_view(),
        name="user-rating-distribution",
    ),
    path("<str:username>/reputation", UserReputationView.as_view(), name="user-reputation"),
    path("<str:username>/reviews", UserReviewsView.as_view(), name="user-reviews"),
    path("<str:username>/stats", UserStatsView.as_view(), name="user-stats"),
    path("<str:username>/top-rated", TopRatedView.as_view(), name="user-top-rated"),
]
