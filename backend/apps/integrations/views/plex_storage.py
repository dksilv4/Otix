"""Plex storage optimization endpoints (authed).

Allows server owners to view storage footprints, breakdown by library/codec/res,
and inspect actionable savings recommendations (duplicates, transcode, unwatched,
watched series, and largest files).
"""

from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.services.plex_storage import (
    analyze_storage_summary,
    get_storage_recommendations,
    list_owned_plex_servers,
    refresh_server_storage_cache,
)


class PlexStorageServersView(APIView):
    """GET /integrations/plex/storage/servers — list linked servers with ownership status."""

    def get(self, request):
        servers = list_owned_plex_servers(request.user)
        return Response({"servers": servers})


class PlexStorageSummaryView(APIView):
    """GET /integrations/plex/storage/summary — aggregate storage analysis & savings estimate."""

    def get(self, request):
        server_id_param = request.query_params.get("server_id")
        server_id = None
        if server_id_param:
            try:
                server_id = int(server_id_param)
            except (ValueError, TypeError):
                server_id = None

        summary = analyze_storage_summary(request.user, server_id=server_id)
        return Response(summary)


class PlexStorageRecommendationsView(APIView):
    """GET /integrations/plex/storage/recommendations — categorized actionable savings items."""

    def get(self, request):
        server_id_param = request.query_params.get("server_id")
        server_id = None
        if server_id_param:
            try:
                server_id = int(server_id_param)
            except (ValueError, TypeError):
                server_id = None

        category = request.query_params.get("category", "duplicates")
        limit = min(int(request.query_params.get("limit", 100)), 500)
        offset = max(int(request.query_params.get("offset", 0)), 0)

        results = get_storage_recommendations(
            request.user,
            server_id=server_id,
            category=category,
            limit=limit,
            offset=offset,
        )
        return Response(results)


class PlexStorageRefreshView(APIView):
    """POST /integrations/plex/storage/refresh — invalidate storage analysis cache."""

    def post(self, request):
        server_id_param = request.data.get("server_id") if request.data else None
        server_id = None
        if server_id_param:
            try:
                server_id = int(server_id_param)
            except (ValueError, TypeError):
                server_id = None

        refresh_server_storage_cache(request.user, server_id=server_id)
        return Response({"detail": "Storage analysis cache refreshed", "success": True})
