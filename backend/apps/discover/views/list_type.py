"""Discover list_type view: a preset feed per media type + list type."""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.discover import services as discover_services
from apps.media.serializers import MediaItemSummarySerializer, SeasonSummarySerializer
from apps.media.services import catalog as catalog_service
from core.pagination import DefaultPagination


class DiscoverPagination(DefaultPagination):
    """Pagination for discover feeds supporting both ?page= and ?cursor= parameters."""

    def get_page_number(self, request, paginator):
        raw = request.query_params.get(self.page_query_param)
        if raw is None:
            raw = request.query_params.get("cursor")
        if raw is not None and str(raw).strip():
            return raw
        return 1


class DiscoverListView(APIView):
    """GET /discover/{media_type}/{list_type} — public, paginated.

    Feeds map onto catalog browse with a preset sort + date window (legacy
    ``_LIST_CONFIG``); the personalized list types resolve to the generic
    popularity fallback until a seeding engine exists, and ``new_season_for_you``
    returns an empty feed. Filters accept ``genre``/``language``/``is_anime``.
    """

    permission_classes = (permissions.AllowAny,)
    pagination_class = DiscoverPagination

    def get(self, request, media_type: str, list_type: str) -> Response:
        language = request.query_params.get("language")
        if language and len(language) > 2:
            language = language.split("-")[0]
        exclude_adult = not (
            request.user.is_authenticated and getattr(request.user, "is_staff", False)
        )
        genre = request.query_params.get("genre") or None
        platform = request.query_params.get("platform") or None
        is_anime = _bool_or_none(request.query_params.get("is_anime"))

        page_num = request.query_params.get("page") or request.query_params.get("cursor") or "1"
        page_size_val = _page_size(request)
        user_id = request.user.id if request.user.is_authenticated else "anon"
        theme = request.headers.get("X-Otix-Theme", "dark")
        cache_key = (
            f"discover:list:{media_type}:{list_type}:{genre}:{language}:"
            f"{is_anime}:{platform}:{exclude_adult}:{user_id}:{theme}:{page_num}:{page_size_val}"
        )

        from django.core.cache import cache

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        if media_type == "season" and list_type == "trending":
            # /discover/season/trending lists each eligible show's latest
            # *season* as the item (gated on the season's premiere date), not
            # the show itself. show/trending stays a normal shows feed below.
            qs = discover_services.trending_seasons(
                genre=genre,
                language=language,
                is_anime=is_anime,
                exclude_adult=exclude_adult,
                user=request.user if getattr(request.user, "is_authenticated", False) else None,
            )
            serializer_cls = SeasonSummarySerializer
        else:
            try:
                qs = discover_services.list_feed(
                    media_type=media_type,
                    list_type=list_type,
                    genre=genre,
                    language=language,
                    is_anime=is_anime,
                    platform=platform,
                    exclude_adult=exclude_adult,
                )
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
            serializer_cls = MediaItemSummarySerializer

        paginator = self.pagination_class()
        paginator.page_size = page_size_val
        page = paginator.paginate_queryset(qs, request, view=self)
        if serializer_cls is MediaItemSummarySerializer:
            context = catalog_service.request_context(request)
            catalog_service.enrich_summaries(page, request.user, context)
        elif serializer_cls is SeasonSummarySerializer:
            catalog_service.attach_season_poster_urls(page)
        serializer = serializer_cls(page, many=True)
        # Summary-list envelope mirrors /discover/hero + catalog similar/
        # recommendations payloads (items + has_more/next_cursor), not the
        # DRF page envelope. The frontend discover feed flattens ``items``.
        has_more = bool(paginator.page.has_next())
        data = {
            "items": serializer.data,
            "has_more": has_more,
            "next_cursor": str(paginator.page.next_page_number()) if has_more else None,
        }
        cache.set(cache_key, data, 180)
        return Response(data)


def _page_size(request) -> int:
    """Resolve feed page size from ``page_size``/``limit`` (default 20)."""
    try:
        raw = request.query_params.get("page_size") or request.query_params.get("limit") or 20
        return max(1, min(int(raw), 50))
    except (TypeError, ValueError):
        return 20


def _bool_or_none(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.lower() in ("1", "true", "yes")
