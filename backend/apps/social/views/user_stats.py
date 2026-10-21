"""User aggregate-stat endpoints (stats, hall-of-fame, library-stats).

Port of ``old-backend/otix/api/user/stats/router.py``; all three reads are public in
legacy. Hall-of-fame depends on the unported ``User.hof_ids`` column and so
returns an empty list until that data has a model home.
"""

from rest_framework import permissions
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services

USER_NOT_FOUND = "User not found"


class UserStatsView(APIView):
    """``GET /users/{username}/stats`` — aggregate counts (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return Response(services.get_user_stats(user.id))


class UserHallOfFameView(APIView):
    """``GET /users/{username}/hall-of-fame`` — curated picks (public, empty)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        is_owner = request.user.is_authenticated and request.user.id == user.id
        media_type = request.query_params.get("media_type")
        sec_key = "top_5" if (not media_type or media_type == "top_5") else media_type
        sec_vis = getattr(user, "section_visibility", {}) or {}
        vis = sec_vis.get(sec_key, "public")
        if not is_owner:
            if vis == "private":
                return Response([])
            if vis == "friends":
                is_friend = False
                if request.user.is_authenticated:
                    status = services.get_friendship_status(request.user.id, user.id)
                    is_friend = status.get("status") == "friends"
                if not is_friend:
                    return Response([])
        return Response(services.get_hall_of_fame(user.id, media_type))


class LibraryStatsView(APIView):
    """``GET /users/{username}/library-stats`` — library rollups (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return Response(services.get_library_stats(user.id))
