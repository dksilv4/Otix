"""User activity endpoints (timeline, mood, heatmap, daily rollup).

Mirror the legacy ``backend/otix/api/user/{activity,daily_activity,friend_feed}
/router.py`` handlers. Timeline/mood-timeline reads of any user are public;
``/me`` rollups are authenticated.
"""

from datetime import date

from rest_framework import permissions
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services

USER_NOT_FOUND = "User not found"


class UserActivityView(APIView):
    """``GET /users/{username}/activity`` — recent activity timeline (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))
        return Response(services.get_user_activity(user.id, limit=limit))


class MoodTimelineView(APIView):
    """``GET /users/{username}/mood-timeline`` — mood check-ins (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        return Response(services.get_mood_timeline(user.id))


class ActivityHeatmapView(APIView):
    """``GET /users/me/activity-heatmap`` — daily counts for the current user."""

    def get(self, request: Request) -> Response:
        try:
            weeks = int(request.query_params.get("weeks", 12))
        except (TypeError, ValueError):
            weeks = 12
        weeks = max(4, min(weeks, 52))
        return Response(services.get_activity_heatmap(request.user.id, weeks))


class DailyActivityView(APIView):
    """``GET /users/me/daily-activity`` — a day's activity for the current user."""

    def get(self, request: Request) -> Response:
        day_param = request.query_params.get("day")
        day = None
        if day_param:
            try:
                day = date.fromisoformat(day_param)
            except ValueError:
                raise ParseError("day must be a date in YYYY-MM-DD format") from None
        return Response(services.get_daily_activity(request.user.id, day))


class FriendsActivityView(APIView):
    """``GET /users/me/friends/activity`` — accepted friends' recent activity."""

    def get(self, request: Request) -> Response:
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))
        friends = services.list_friends(request.user.id)
        return Response(services.get_friends_activity(request.user.id, friends, limit=limit))
