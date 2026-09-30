"""Catalog views: browse list, genres, certifications, company lookup, detail,
similar/recommendations and admin asset listing.

Public reads use ``AllowAny`` and treat ``request.user`` as anonymous when no
token is present (legacy ``get_optional_user``). Logic lives in
``apps.media.services``.
"""

from __future__ import annotations

import logging

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

logger = logging.getLogger(__name__)

MEDIA_ITEM_NOT_FOUND = "Media item not found"


def resolve_media_pk(media_type: str | None, media_id: str | int) -> int | None:
    from apps.media.services.identity import CANONICAL_PROVIDER, find_media_id

    raw = str(media_id).strip()
    if not raw:
        return None

    # 1. If raw is digits, check exact PK first;
    # if absent, check if it's a canonical provider external ID
    if raw.isdigit():
        val = int(raw)
        qs = MediaItem.objects.filter(pk=val)
        if media_type:
            qs = qs.filter(media_type=media_type)
        if qs.exists():
            return val
        canonical = CANONICAL_PROVIDER.get(media_type) if media_type else None
        if canonical:
            found = find_media_id(canonical, raw, media_type)
            if found is not None:
                return found
            if media_type == "game":
                found_steam = find_media_id("steam", raw, "game")
                if found_steam is not None:
                    return found_steam
            from apps.integrations.services.catalog_seed import ensure_catalog_job
            from apps.integrations.services.fetch_proxy import server_can_fetch
            from apps.integrations.services.sync import execute_sync_job

            if server_can_fetch(canonical):
                job = ensure_catalog_job(canonical, media_type, raw, priority=0, dispatch=False)
                if job is not None:
                    try:
                        execute_sync_job(job.pk)
                    except Exception:
                        logger.exception("On-demand sync failed for %s:%s", canonical, raw)
                found = find_media_id(canonical, raw, media_type)
                if found is not None:
                    return found
        if MediaItem.objects.filter(pk=val).exists():
            return val

    # 2. Check slug match
    slug_qs = MediaItem.objects.filter(slug=raw)
    if media_type:
        slug_qs = slug_qs.filter(media_type=media_type)
    slug_match = slug_qs.values_list("pk", flat=True).first()
    if slug_match is not None:
        return slug_match

    # 3. Handle prefixed IDs
    provider = None
    ext_id = None
    target_media_type = media_type

    if raw.startswith("tmdb:movie:"):
        provider = "tmdb"
        target_media_type = "movie"
        ext_id = raw.split("tmdb:movie:")[1].strip()
    elif raw.startswith("tmdb:show:"):
        provider = "tmdb"
        target_media_type = "show"
        ext_id = raw.split("tmdb:show:")[1].strip()
    elif raw.startswith("tmdb:"):
        provider = "tmdb"
        ext_id = raw.split("tmdb:")[1].strip()
    elif raw.startswith("igdb:game:"):
        provider = "igdb"
        target_media_type = "game"
        ext_id = raw.split("igdb:game:")[1].strip()
    elif raw.startswith("igdb:"):
        provider = "igdb"
        target_media_type = "game"
        ext_id = raw.split("igdb:")[1].strip()
    elif raw.startswith("steam:game:"):
        provider = "steam"
        target_media_type = "game"
        ext_id = raw.split("steam:game:")[1].strip()
    elif raw.startswith("steam:"):
        provider = "steam"
        target_media_type = "game"
        ext_id = raw.split("steam:")[1].strip()
    elif raw.startswith("steamgrid:"):
        provider = "steamgrid"
        target_media_type = "game"
        ext_id = raw.split("steamgrid:")[1].strip()
    elif raw.startswith("tvdb:"):
        provider = "tvdb"
        target_media_type = "show"
        ext_id = raw.split("tvdb:")[1].strip()
    elif raw.startswith("imdb:"):
        provider = "imdb"
        ext_id = raw.split("imdb:")[1].strip()

    if not provider or not ext_id:
        return None

    found = find_media_id(provider, ext_id, target_media_type)
    if found is not None:
        return found

    if provider == "steam":
        from apps.media.services.steam_seed import resolve_steam_app_to_game

        item = resolve_steam_app_to_game(int(ext_id)) if ext_id.isdigit() else None
        if item is not None:
            return item.pk
        return None

    from apps.integrations.services.catalog_seed import ensure_catalog_job
    from apps.integrations.services.sync import execute_sync_job

    job = ensure_catalog_job(provider, target_media_type, ext_id, priority=0, dispatch=False)
    if job is not None:
        try:
            execute_sync_job(job.pk)
        except Exception:
            logger.exception("On-demand sync failed for %s:%s", provider, ext_id)
    return find_media_id(provider, ext_id, target_media_type)


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
        context = catalog_service.request_context(request)
        catalog_service.enrich_summaries(page, user, context)
        serializer = MediaItemSummarySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


def _enqueue_detail_rehydrate(item: MediaItem) -> bool:
    from datetime import timedelta

    from django.utils import timezone

    from apps.integrations.services.catalog_seed import ensure_catalog_job
    from apps.integrations.services.fetch_proxy import server_can_fetch
    from apps.integrations.services.sync import execute_sync_job
    from apps.media.services.catalog_lifecycle import canonical_external_id
    from apps.media.services.identity import CANONICAL_PROVIDER
    from apps.media.services.tmdb_ingest import show_needs_episodes

    provider = CANONICAL_PROVIDER.get(item.media_type)
    ext = canonical_external_id(item)
    if not provider or not ext:
        return False

    recently_synced = bool(
        item.synced_at and item.synced_at > timezone.now() - timedelta(minutes=15)
    )
    needs_episodes = item.media_type == "show" and show_needs_episodes(item.pk)

    if needs_episodes and server_can_fetch(provider) and not recently_synced:
        job = ensure_catalog_job(
            provider, item.media_type, ext, priority=0, force=True, dispatch=False
        )
        if job is not None:
            try:
                execute_sync_job(job.pk)
                return True
            except Exception:
                logger.exception("Synchronous episode sync failed for %s:%s", provider, ext)
    else:
        ensure_catalog_job(provider, item.media_type, ext, priority=0, force=needs_episodes)
    return False


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

    def get(self, request, media_type: str, media_id: str | int) -> Response:
        user_id = request.user.id if request.user.is_authenticated else "anon"
        theme = request.headers.get("X-Otix-Theme", "dark")
        cache_key = f"media:detail:{media_type}:{media_id}:{user_id}:{theme}"
        from django.core.cache import cache

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        pk = resolve_media_pk(media_type, media_id)
        if pk is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        item = catalog_service.media_detail_queryset(pk)
        if item is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        context = catalog_service.request_context(request)
        catalog_service.enrich_summaries([item], request.user, context)
        rehydrated = _enqueue_detail_rehydrate(item)
        if rehydrated:
            refreshed = catalog_service.media_detail_queryset(pk)
            if refreshed is not None:
                item = refreshed
                catalog_service.enrich_summaries([item], request.user, context)

        # Automated hydration: if a game has 0 characters and 0 credits, trigger background task
        if item.media_type == "game" and item.characters.count() == 0 and item.credits.count() == 0:
            try:
                from apps.media.tasks import hydrate_game_characters_and_credits_task

                hydrate_game_characters_and_credits_task.delay(item.pk)
            except Exception:
                pass

        data = MediaItemDetailSerializer(item).data
        cache.set(cache_key, data, 120)
        return Response(data)


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

    def get(self, request, media_type: str, media_id: str | int) -> Response:
        filter_type = request.query_params.get("media_type")
        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        pk = resolve_media_pk(media_type, media_id)
        if pk is None:
            return Response([])
        items = catalog_service.similar_items(pk, filter_type, min(limit, 50))
        context = catalog_service.request_context(request)
        catalog_service.enrich_summaries(items, request.user, context)
        return Response(_summary_list_payload(items))


class RecommendationView(APIView):
    """``GET /media/{media_type}/{media_id}/recommendations`` (public).

    Authenticated callers get a taste-blended embedding neighborhood (For You).
    Anonymous callers, or users without seeds/embeddings, fall back to the same
    content signal as ``/similar``.
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request, media_type: str, media_id: str | int) -> Response:
        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        pk = resolve_media_pk(media_type, media_id)
        if pk is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        source_type = catalog_service.media_type_or_none(pk)
        if source_type is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        items = catalog_service.recommended_items(
            pk, source_type, min(limit, 50), user=request.user
        )
        context = catalog_service.request_context(request)
        catalog_service.enrich_summaries(items, request.user, context)
        return Response(_summary_list_payload(items))


class DecideWatchView(APIView):
    """``GET /media/decide`` — hero pick + shortlist from taste (auth required)."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request) -> Response:
        try:
            limit = int(request.query_params.get("limit", 5))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        limit = max(1, min(limit, 12))

        raw_types = request.query_params.get("media_types", "movie,show")
        media_types = [t.strip() for t in raw_types.split(",") if t.strip()]

        raw_genres = request.query_params.get("genre_ids", "")
        genre_ids: list[int] = []
        if raw_genres.strip():
            try:
                genre_ids = [int(x) for x in raw_genres.split(",") if x.strip()]
            except ValueError:
                raise ValidationError("genre_ids must be comma-separated integers") from None

        runtime = request.query_params.get("runtime") or None
        if runtime is not None and runtime not in ("short", "medium", "long"):
            raise ValidationError("runtime must be short, medium, or long")

        seed = _int_or_none(request.query_params.get("seed"))

        items, cold_start = catalog_service.decide_items(
            request.user,
            media_types=media_types,
            genre_ids=genre_ids or None,
            runtime=runtime,
            limit=limit,
            seed=seed,
        )
        context = catalog_service.request_context(request)
        catalog_service.enrich_summaries(items, request.user, context)
        summaries = MediaItemSummarySerializer(items, many=True).data
        pick = summaries[0] if summaries else None
        shortlist = summaries[1:] if len(summaries) > 1 else []
        return Response(
            {
                "pick": pick,
                "shortlist": shortlist,
                "cold_start": cold_start,
            }
        )


class MediaAssetsView(APIView):
    """``GET /media/{media_type}/{media_id}/assets`` (admin-only)."""

    def get(self, request, media_type: str, media_id: str | int) -> Response:
        if not getattr(request.user, "is_staff", False):
            raise PermissionDenied("Admin privileges required")
        pk = resolve_media_pk(media_type, media_id)
        if pk is None:
            raise NotFound(MEDIA_ITEM_NOT_FOUND)
        item = MediaItem.objects.filter(pk=pk).prefetch_related("assets").first()
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
