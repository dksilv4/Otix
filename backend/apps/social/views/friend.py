"""Friend-graph endpoints.

Mirror the legacy ``old-backend/otix/api/user/friend/router.py`` status codes:
send = 201 with a message body, accept/reject/remove = 200 with a message body,
unknown friend on remove = 404 ``{"detail": "Friend not found"}``. List and
status endpoints return the legacy body shapes directly (they are not paginated
in FastAPI).
"""

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers import (
    FriendOutSerializer,
    FriendRequestOutSerializer,
    FriendshipStatusSerializer,
)


class FriendListView(APIView):
    """``GET /api/v1/friends/`` -- the authenticated user's accepted friends."""

    def get(self, request: Request) -> Response:
        friends = services.list_friends(request.user.id)
        return Response(FriendOutSerializer(friends, many=True).data)


class FriendshipStatusView(APIView):
    """``GET /api/v1/friends/status/{user_id}`` -- relationship with another user."""

    def get(self, request: Request, user_id: int) -> Response:
        data = services.get_friendship_status(request.user.id, user_id)
        return Response(FriendshipStatusSerializer(data).data)


class FriendRequestsIncomingView(APIView):
    """``GET /api/v1/friends/requests/incoming`` -- pending requests I received."""

    def get(self, request: Request) -> Response:
        requests_ = services.pending_received(request.user.id)
        return Response(FriendRequestOutSerializer(requests_, many=True).data)


class FriendRequestsOutgoingView(APIView):
    """``GET /api/v1/friends/requests/outgoing`` -- pending requests I sent."""

    def get(self, request: Request) -> Response:
        requests_ = services.pending_sent(request.user.id)
        return Response(FriendRequestOutSerializer(requests_, many=True).data)


class SendFriendRequestView(APIView):
    """``POST /api/v1/friends/requests/{user_id}`` -- send a friend request."""

    def post(self, request: Request, user_id: int) -> Response:
        receiver = services.get_user_by_id(user_id)
        if receiver is None:
            raise NotFound("User not found")
        try:
            services.send_friend_request(request.user.id, user_id)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Friend request sent"}, status=status.HTTP_201_CREATED)


class AcceptFriendRequestView(APIView):
    """``POST /api/v1/friends/requests/{request_id}/accept`` -- accept a request."""

    def post(self, request: Request, request_id: int) -> Response:
        try:
            services.accept_friend_request(request_id, request.user.id)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response({"message": "Friend request accepted"}, status=status.HTTP_200_OK)


class RejectFriendRequestView(APIView):
    """``POST /api/v1/friends/requests/{request_id}/reject`` -- reject a request."""

    def post(self, request: Request, request_id: int) -> Response:
        try:
            services.reject_friend_request(request_id, request.user.id)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response({"message": "Friend request rejected"}, status=status.HTTP_200_OK)


class RemoveFriendView(APIView):
    """``DELETE /api/v1/friends/{user_id}`` -- unfriend another user."""

    def delete(self, request: Request, user_id: int) -> Response:
        removed = services.remove_friend(request.user.id, user_id)
        if not removed:
            raise NotFound("Friend not found")
        return Response({"message": "Friend removed"}, status=status.HTTP_200_OK)
