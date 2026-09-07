"""Friend/follow-request routes (social domain).

Mounted at ``/api/v1/friends/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). Literal routes (``requests/incoming``,
``requests/outgoing``) precede ``requests/<int:user_id>`` so the literal segment
is never matched as an id. ``user_id``/``request_id`` are integer converters
(greenfield PKs).
"""

from django.urls import path

from apps.social.views import (
    AcceptFriendRequestView,
    FriendListView,
    FriendRequestsIncomingView,
    FriendRequestsOutgoingView,
    FriendshipStatusView,
    RejectFriendRequestView,
    RemoveFriendView,
    SendFriendRequestView,
)

app_name = "friends"

urlpatterns = [
    path("", FriendListView.as_view(), name="friend-list"),
    path("status/<int:user_id>", FriendshipStatusView.as_view(), name="friend-status"),
    path(
        "requests/incoming",
        FriendRequestsIncomingView.as_view(),
        name="friend-requests-incoming",
    ),
    path(
        "requests/outgoing",
        FriendRequestsOutgoingView.as_view(),
        name="friend-requests-outgoing",
    ),
    path("requests/<int:user_id>", SendFriendRequestView.as_view(), name="friend-request-send"),
    path(
        "requests/<int:request_id>/accept",
        AcceptFriendRequestView.as_view(),
        name="friend-request-accept",
    ),
    path(
        "requests/<int:request_id>/reject",
        RejectFriendRequestView.as_view(),
        name="friend-request-reject",
    ),
    path("<int:user_id>", RemoveFriendView.as_view(), name="friend-remove"),
]
