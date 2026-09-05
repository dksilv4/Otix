"""User aggregate-stat endpoints (stats, hall-of-fame, library-stats).

Port of ``backend/otix/api/user/stats/router.py``; all three reads are public in
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
        media_type = request.query_params.get("media_type")
        return Response(services.get_hall_of_fame(user.id, media_type))


class LibraryStatsView(APIView):
    """``GET /users/{username}/library-stats`` — library rollups (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return Response(services.get_library_stats(user.id))
