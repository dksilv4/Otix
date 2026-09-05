"""Discover list_type view: a preset feed per media type + list type."""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.discover import services as discover_services
from apps.media.serializers import MediaItemSummarySerializer
from apps.media.services import catalog as catalog_service
from core.pagination import DefaultPagination


class DiscoverListView(APIView):
    """GET /discover/{media_type}/{list_type} — public, paginated.

    Feeds map onto catalog browse with a preset sort + date window (legacy
    ``_LIST_CONFIG``); the personalized list types resolve to the generic
    popularity fallback until a seeding engine exists, and ``new_season_for_you``
    returns an empty feed. Filters accept ``genre``/``language``/``is_anime``.
    """

    permission_classes = (permissions.AllowAny,)
    pagination_class = DefaultPagination

    def get(self, request, media_type: str, list_type: str) -> Response:
        language = request.query_params.get("language")
        if language and len(language) > 2:
            language = language.split("-")[0]
        exclude_adult = not (
            request.user.is_authenticated and getattr(request.user, "is_staff", False)
        )
        try:
            qs = discover_services.list_feed(
                media_type=media_type,
                list_type=list_type,
                genre=request.query_params.get("genre") or None,
                language=language,
                is_anime=_bool_or_none(request.query_params.get("is_anime")),
                exclude_adult=exclude_adult,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        catalog_service.enrich_summaries(page, request.user)
        serializer = MediaItemSummarySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


def _bool_or_none(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.lower() in ("1", "true", "yes")
