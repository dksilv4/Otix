"""Views for managing blocked recommendations (blocking/unblocking media items)."""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media import services
from apps.media.serializers.catalog import MediaItemSummarySerializer


class BlockRecommendationView(APIView):
    """``POST`` / ``DELETE /media/<media_id>/block-recommendation`` (auth required).

    Also supports ``/media/<media_type>/<media_id>/block-recommendation``.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, media_id: int, media_type: str | None = None) -> Response:
        created, item = services.block_media_recommendation(request.user, media_id)
        if item is None:
            raise NotFound("Media item not found")
        return Response(
            {
                "blocked": True,
                "created": created,
                "media_id": media_id,
                "title": item.title,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request, media_id: int, media_type: str | None = None) -> Response:
        unblocked = services.unblock_media_recommendation(request.user, media_id)
        return Response(
            {
                "blocked": False,
                "unblocked": unblocked,
                "media_id": media_id,
            },
            status=status.HTTP_200_OK,
        )


class BlockedRecommendationListView(APIView):
    """``GET /media/blocked-recommendations`` — list blocked recommendations (auth required)."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request) -> Response:
        items = services.list_blocked_recommendations(request.user)
        context = services.catalog.request_context(request)
        services.enrich_summaries(items, request.user, context)
        payload = MediaItemSummarySerializer(items, many=True).data
        return Response({"items": payload, "total": len(payload)})
