"""User-follow endpoints (``/users/{username}/follow*``).

Mirror the legacy ``old-backend/otix/api/user/follow/router.py``: follow POST is 201
with a message/status body, unfollow DELETE is 204, accept/decline are 200 with
a message body and 404 when the request is gone. Unknown target users are a 404
``{"detail": "User not found"}``; a non-owner reading/acting on a request inbox
is a 403.
"""

from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers.user_surface import (
    FollowCountsSerializer,
    FollowRequestOutSerializer,
    FollowRequestResponseSerializer,
    FollowStatusSerializer,
    FollowUserSerializer,
)

USER_NOT_FOUND = "User not found"


def _target_or_404(username: str):
    target = services.get_user_by_username(username)
    if target is None:
        raise NotFound(USER_NOT_FOUND)
    return target


class UserFollowView(APIView):
    """``POST``/``DELETE /users/{username}/follow`` (authenticated)."""

    def post(self, request: Request, username: str) -> Response:
        target = _target_or_404(username)
        try:
            body = services.follow_user(request.user.id, target.id, username)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(body, status=status.HTTP_201_CREATED)

    def delete(self, request: Request, username: str) -> Response:
        target = _target_or_404(username)
        services.unfollow_user(request.user.id, target.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FollowCountsView(APIView):
    """``GET /users/{username}/follow/counts`` — public follower/following counts."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        target = _target_or_404(username)
        counts = services.get_counts(target.id)
        return Response(FollowCountsSerializer(counts).data)


class FollowRequestsView(APIView):
    """``GET /users/{username}/follow/requests`` — pending requests I received."""

    def get(self, request: Request, username: str) -> Response:
        target = _target_or_404(username)
        if target.id != request.user.id:
            return Response(
                {"detail": "You can only view your own follow requests"},
                status=status.HTTP_403_FORBIDDEN,
            )
        pending = services.get_pending_requests(request.user.id)
        return Response(
            {
                "requests": FollowRequestOutSerializer(pending, many=True).data,
                "total": len(pending),
            }
        )


class FollowStatusView(APIView):
    """``GET /users/{username}/follow/status`` — my follow state with a target."""

    def get(self, request: Request, username: str) -> Response:
        target = _target_or_404(username)
        is_following = services.is_following(request.user.id, target.id)
        has_pending = False
        if not is_following:
            has_pending = services.get_request_status(request.user.id, target.id) == "pending"
        return Response(
            FollowStatusSerializer(
                {
                    "is_following": is_following,
                    "has_pending_request": has_pending,
                    "is_private": False,
                }
            ).data
        )


class AcceptFollowRequestView(APIView):
    """``POST /users/{username}/follow/requests/{request_id}/accept``."""

    def post(self, request: Request, username: str, request_id: int) -> Response:
        target = _target_or_404(username)
        if target.id != request.user.id:
            return Response(
                {"detail": "You can only accept your own follow requests"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            services.accept_follow_request(request_id, request.user.id)
        except ValueError as exc:
            raise NotFound(str(exc)) from None
        return Response(
            FollowRequestResponseSerializer(
                {"message": "Follow request accepted", "request_id": request_id}
            ).data
        )


class DeclineFollowRequestView(APIView):
    """``POST /users/{username}/follow/requests/{request_id}/decline``."""

    def post(self, request: Request, username: str, request_id: int) -> Response:
        target = _target_or_404(username)
        if target.id != request.user.id:
            return Response(
                {"detail": "You can only decline your own follow requests"},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            services.decline_follow_request(request_id, request.user.id)
        except ValueError as exc:
            raise NotFound(str(exc)) from None
        return Response(
            FollowRequestResponseSerializer(
                {"message": "Follow request declined", "request_id": request_id}
            ).data
        )


class FollowersView(generics.ListAPIView):
    """``GET /users/{username}/followers`` — public paginated follower list."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = FollowUserSerializer

    def get_queryset(self):
        target = _target_or_404(self.kwargs["username"])
        return services.get_followers(target.id)


class FollowingView(generics.ListAPIView):
    """``GET /users/{username}/following`` — public paginated following list."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = FollowUserSerializer

    def get_queryset(self):
        target = _target_or_404(self.kwargs["username"])
        return services.get_following(target.id)
