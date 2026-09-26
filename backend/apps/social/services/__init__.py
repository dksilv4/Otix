"""Social domain services, re-exported for convenient imports.

Plain callables over the models (one module per concern); views stay thin and
serializers declarative. Friend-request services raise ``ValueError`` /
``PermissionError`` for request-state problems and the views translate those to
the legacy 400/403 detail bodies.
"""

from apps.social.services.continue_watching import get_continue_watching
from apps.social.services.friend import (
    accept_friend_request,
    count_friends,
    get_friendship_status,
    get_user_by_id,
    list_friends,
    pending_received,
    pending_sent,
    reject_friend_request,
    remove_friend,
    send_friend_request,
)
from apps.social.services.metric import get_metrics_snapshot
from apps.social.services.mood import dismiss_checkin, get_today_checkin, submit_checkin
from apps.social.services.notification import (
    get_unread_count,
    list_notifications,
    mark_all_read,
    mark_notification_read,
)
from apps.social.services.review import (
    get_my_vote,
    get_review_by_composite,
    get_vote_counts,
    remove_vote,
    vote_review,
)
from apps.social.services.user_activity import (
    get_activity_heatmap,
    get_daily_activity,
    get_friends_activity,
    get_mood_timeline,
    get_user_activity,
)
from apps.social.services.user_badges import claim_badge, get_user_badges
from apps.social.services.user_follow import (
    accept_follow_request,
    decline_follow_request,
    follow_user,
    get_counts,
    get_followers,
    get_following,
    get_pending_requests,
    get_request_status,
    get_user_by_username,
    is_following,
    unfollow_user,
)
from apps.social.services.user_karma import get_karma_balance, get_karma_transactions
from apps.social.services.user_rating import (
    compute_composite_score,
    delete_rating,
    get_my_rating,
    get_rating_distribution,
    media_asset_url,
    peer_rating_aggregates,
    top_rated,
    upsert_rating,
)
from apps.social.services.user_reviews import get_user_reviews
from apps.social.services.user_stats import (
    get_hall_of_fame,
    get_library_stats,
    get_user_stats,
)

__all__ = [
    "accept_follow_request",
    "accept_friend_request",
    "claim_badge",
    "compute_composite_score",
    "count_friends",
    "decline_follow_request",
    "delete_rating",
    "dismiss_checkin",
    "follow_user",
    "get_activity_heatmap",
    "get_continue_watching",
    "get_counts",
    "get_daily_activity",
    "get_followers",
    "get_following",
    "get_friends_activity",
    "get_friendship_status",
    "get_hall_of_fame",
    "get_karma_balance",
    "get_karma_transactions",
    "get_library_stats",
    "get_metrics_snapshot",
    "get_mood_timeline",
    "get_my_rating",
    "get_my_vote",
    "get_pending_requests",
    "get_rating_distribution",
    "get_request_status",
    "get_review_by_composite",
    "get_today_checkin",
    "get_unread_count",
    "get_user_activity",
    "get_user_badges",
    "get_user_by_id",
    "get_user_by_username",
    "get_user_reviews",
    "get_user_stats",
    "get_vote_counts",
    "is_following",
    "list_friends",
    "list_notifications",
    "mark_all_read",
    "mark_notification_read",
    "media_asset_url",
    "peer_rating_aggregates",
    "pending_received",
    "pending_sent",
    "reject_friend_request",
    "remove_friend",
    "remove_vote",
    "send_friend_request",
    "submit_checkin",
    "top_rated",
    "unfollow_user",
    "upsert_rating",
    "vote_review",
]
