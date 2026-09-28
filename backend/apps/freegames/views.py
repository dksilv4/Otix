"""Free games API views."""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.freegames.services.aggregator import aggregator


class FreeGamesListView(APIView):
    """GET /api/v1/free-games/ — List current and upcoming promotional free games."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request) -> Response:
        refresh = request.query_params.get("refresh", "").lower() in ("1", "true", "yes")
        data = aggregator.get_free_games(request=request, use_cache=not refresh)
        return Response(data)
