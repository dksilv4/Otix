"""User media-calendar endpoint (legacy ``calendar/router.py``).

Upcoming releases derived from the current user's watchlist, watched shows,
and franchises when authenticated, or public upcoming releases when anonymous.
Returns ``{"events": [...]}``, mirroring the legacy ``CalendarResponse`` envelope.
"""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.serializers.calendar import CalendarEventSerializer
from apps.media.services.calendar import build_calendar


class CalendarView(APIView):
    """``GET /api/v1/calendar`` — upcoming-release calendar."""

    permission_classes = [permissions.AllowAny]

    def get(self, request) -> Response:
        user_id = request.user.id if request.user and request.user.is_authenticated else None
        events = build_calendar(user_id)
        return Response({"events": CalendarEventSerializer(events, many=True).data})
