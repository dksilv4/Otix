"""Mood check-in endpoints.

Mirror the legacy ``old-backend/otix/api/user/mood/router.py``: ``GET /today``
returns ``{due, checkin}``, ``POST /`` submits today's mood and ``POST /dismiss``
silences today's prompt. All return the legacy 200 envelope (no 201 on create).
"""

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers import (
    MoodCheckInOutSerializer,
    MoodCheckInTodaySerializer,
    MoodCreateBodySerializer,
)


class MoodCheckInTodayView(APIView):
    """``GET /api/v1/mood-checkins/today`` -- today's status, if any."""

    def get(self, request: Request) -> Response:
        checkin = services.get_today_checkin(request.user.id)
        payload = MoodCheckInTodaySerializer({"due": checkin is None, "checkin": checkin}).data
        return Response(payload)


class MoodCheckInCreateView(APIView):
    """``POST /api/v1/mood-checkins/`` -- submit today's mood."""

    def post(self, request: Request) -> Response:
        body = MoodCreateBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        checkin = services.submit_checkin(
            request.user.id, data["mood"], data.get("feeling"), data.get("note")
        )
        return Response(MoodCheckInOutSerializer(checkin).data)


class MoodCheckInDismissView(APIView):
    """``POST /api/v1/mood-checkins/dismiss`` -- dismiss today's prompt."""

    def post(self, request: Request) -> Response:
        checkin = services.dismiss_checkin(request.user.id)
        return Response(MoodCheckInOutSerializer(checkin).data)
