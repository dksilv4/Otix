"""Discover hero view: a shuffled, artwork-backed catalog slice."""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.discover import services as discover_services
from apps.media.serializers import MediaItemSummarySerializer
from apps.media.services import catalog as catalog_service


class DiscoverHeroView(APIView):
    """GET /discover/hero — public, optional user.

    Returns a random subset of catalog items that all have usable artwork
    (mirrors the legacy hero pool: ``min(limit * 4, 50)`` candidates, shuffled,
    sliced to ``limit``, capped at 20).
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request) -> Response:
        try:
            limit = int(request.query_params.get("limit", 9))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        limit = max(1, min(limit, 20))
        exclude_adult = not (
            request.user.is_authenticated and getattr(request.user, "is_staff", False)
        )
        items = discover_services.hero_items(exclude_adult=exclude_adult, limit=limit)
        catalog_service.enrich_summaries(items, request.user)
        return Response(
            {
                "items": MediaItemSummarySerializer(items, many=True).data,
                "has_more": False,
                "next_cursor": None,
            }
        )
