"""Catalog views: browse list, genres, certifications, company lookup, detail,
similar/recommendations and admin asset listing.

Public reads use ``AllowAny`` and treat ``request.user`` as anonymous when no
token is present (legacy ``get_optional_user``). Logic lives in
``apps.media.services``.
"""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.models import MediaItem
from apps.media.serializers import (
    CompanyOutSerializer,
    GenreOutSerializer,
    MediaAssetOutSerializer,
    MediaItemDetailSerializer,
    MediaItemSummarySerializer,
)
from apps.media.services import assets as assets_service
from apps.media.services import catalog as catalog_service
from core.pagination import DefaultPagination

MEDIA_ITEM_NOT_FOUND = "Media item not found"


class MediaListView(APIView):
    """``GET /media/`` — paginated catalog browse (public)."""

    permission_classes = (permissions.AllowAny,)
    pagination_class = DefaultPagination

    def get(self, request) -> Response:
        params = request.query_params
        user = request.user
        qs = catalog_service.list_media(
            media_type=params.get("media_type") or None,
            genre=params.get("genre") or None,
            company=params.get("company") or None,
            language=params.get("language") or None,
            is_anime=_bool_or_none(params.get("is_anime")),
            exclude_adult=not (user.is_authenticated and getattr(user, "is_staff", False)),
            sort_by=params.get("sort_by") or None,
            sort_dir=params.get("sort_dir") or "desc",
            person_id=_int_or_none(params.get("person_id")),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        catalog_service.enrich_summaries(page, user)
        serializer = MediaItemSummarySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


def _enqueue_detail_rehydrate(item: MediaItem) -> None:
    from apps.integrations.services.catalog_seed import ensure_catalog_job
    from apps.media.services.catalog_lifecycle import canonical_external_id
    from apps.media.services.identity import CANONICAL_PROVIDER

    provider = CANONICAL_PROVIDER.get(item.media_type)
    ext = canonical_external_id(item)
    if not provider or not ext:
        return
    ensure_catalog_job(provider, item.media_type, ext, priority=0)


class GenreListView(APIView):
    """``GET /media/genres?media_type=...`` — genre vocabulary (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request) -> Response:
        genres = catalog_service.genre_list(request.query_params.get("media_type") or None)
        return Response(GenreOutSerializer(genres, many=True).data)


class CertificationListView(APIView):
    """``GET /media/certifications`` — certification strings (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request) -> Response:
        country = request.query_params.get("country_code") or "us"
        media_type = request.query_params.get("media_type") or None
        return Response(catalog_service.certification_list(country, media_type))


class CompanyLookupView(APIView):
    """``GET /media/company?id=...&slug=...`` — company lookup (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request) -> Response:
        params = request.query_params
        company_id = _int_or_none(params.get("id"))
        slug = params.get("slug")
        if company_id is None and not slug:
            raise ValidationError("Provide id or slug")
        company = catalog_service.company_by_id_or_slug(id=company_id, slug=slug)
        if company is None:
            raise NotFound("Company not found")
        return Response(CompanyOutSerializer(company).data)


class MediaDetailView(APIView):
    """``GET /media/{media_type}/{media_id}`` — full detail (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request, media_type: str, media_id: int) -> Response:
        item = catalog_service.media_detail_queryset(media_id)
        if item is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        theme = request.query_params.get("theme")
        context = theme if theme in ("dark", "light") else "general"
        catalog_service.enrich_summaries([item], request.user, context)
        _enqueue_detail_rehydrate(item)
        return Response(MediaItemDetailSerializer(item).data)


class CatalogStreamView(APIView):
    """``GET /media/stream`` — catalog ``media.updated`` / ``media.merged`` SSE."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        from apps.media.services.catalog_events import CATALOG_CHANNEL
        from core import sse as sse_lib

        return sse_lib.sse_response(CATALOG_CHANNEL)


class SimilarMediaView(APIView):
    """``GET /media/{media_type}/{media_id}/similar`` (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request, media_type: str, media_id: int) -> Response:
        filter_type = request.query_params.get("media_type")
        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        items = catalog_service.similar_items(media_id, filter_type, min(limit, 50))
        catalog_service.enrich_summaries(items, request.user)
        return Response(_summary_list_payload(items))


class RecommendationView(APIView):
    """``GET /media/{media_type}/{media_id}/recommendations`` (public).

    Legacy personalised recommendations relied on pgvector embeddings + the
    personalization service; both are deferred, so this falls back to the same
    genre-overlap content signal as ``/similar``.
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request, media_type: str, media_id: int) -> Response:
        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        source_type = catalog_service.media_type_or_none(media_id)
        if source_type is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        items = catalog_service.similar_items(media_id, source_type, min(limit, 50))
        catalog_service.enrich_summaries(items, request.user)
        return Response(_summary_list_payload(items))


class MediaAssetsView(APIView):
    """``GET /media/{media_type}/{media_id}/assets`` (admin-only)."""

    def get(self, request, media_type: str, media_id: int) -> Response:
        if not getattr(request.user, "is_staff", False):
            raise PermissionDenied("Admin privileges required")
        item = MediaItem.objects.filter(pk=media_id).prefetch_related("assets").first()
        if item is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        # Materialized textless twins exist only to back a textless pick; the
        # source image (poster/backdrop) is shown instead, flagged via is_textless.
        assets = (
            item.assets.all()
            .exclude(label=assets_service.MATERIALIZED_TEXTLESS_LABEL)
            .order_by("asset_type", "lang", "-score")
        )
        current_ids = {
            ctx: assets_service.current_primary_asset_ids(item, ctx)
            for ctx in assets_service.SELECTION_CONTEXTS
        }
        return Response(
            {
                "items": MediaAssetOutSerializer(
                    assets,
                    many=True,
                    context={
                        "current_ids": current_ids,
                        "textless_urls": assets_service.textless_winner_urls(item),
                    },
                ).data,
                "total": assets.count(),
            }
        )


def _summary_list_payload(items: list[MediaItem]) -> dict:
    return {
        "items": MediaItemSummarySerializer(items, many=True).data,
        "tracks": [],
        "total": len(items),
        "next_cursor": None,
        "has_more": False,
        "backfill_pending": False,
    }


def _bool_or_none(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.lower() in ("1", "true", "yes")


def _int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None
