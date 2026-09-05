"""Social domain services, re-exported for convenient imports.

Plain callables over the models (one module per concern); views stay thin and
serializers declarative. Friend-request services raise ``ValueError`` /
``PermissionError`` for request-state problems and the views translate those to
the legacy 400/403 detail bodies.
"""

from apps.social.services.friend import (
    accept_friend_request,
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

__all__ = [
    "accept_friend_request",
    "dismiss_checkin",
    "get_friendship_status",
    "get_metrics_snapshot",
    "get_my_vote",
    "get_review_by_composite",
    "get_today_checkin",
    "get_unread_count",
    "get_user_by_id",
    "get_vote_counts",
    "list_friends",
    "list_notifications",
    "mark_all_read",
    "mark_notification_read",
    "pending_received",
    "pending_sent",
    "reject_friend_request",
    "remove_friend",
    "remove_vote",
    "send_friend_request",
    "submit_checkin",
    "vote_review",
]
