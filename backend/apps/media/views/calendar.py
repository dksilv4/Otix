"""User media-calendar endpoint (legacy ``calendar/router.py``).

Authenticated leaf route: upcoming releases derived from the current user's
watchlist, watched shows, and franchises. Returns ``{"events": [...]}``,
mirroring the legacy ``CalendarResponse`` envelope.
"""

from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.serializers.calendar import CalendarEventSerializer
from apps.media.services.calendar import build_calendar


class CalendarView(APIView):
    """``GET /api/v1/calendar`` — the current user's upcoming-release calendar."""

    def get(self, request) -> Response:
        events = build_calendar(request.user.id)
        return Response({"events": CalendarEventSerializer(events, many=True).data})
