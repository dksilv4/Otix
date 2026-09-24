"""Search endpoints: suggestions, media, grouped, companies, poll and providers.

All legacy search routes are public (``get_optional_user``), so each view opts
out of the global ``IsAuthenticated`` default with ``AllowAny`` and treats
``request.user`` as anonymous when no token is present. Views are thin: query
parsing/validation lives here and response assembly in ``apps.search.services``.

External-only routes (``/search/external``, ``/search/steamgrid``) return the
legacy-shaped empty contract because the underlying IGDB/SteamGridDB providers
are not wired up yet; ``/search/providers`` answers the Otix catalog branch from
our DB.
"""

from django.http import QueryDict
from rest_framework import permissions
from rest_framework.exceptions import ParseError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.search import services
from apps.search.serializers import (
    ProviderSearchRequestSerializer,
    SteamGridSearchRequestSerializer,
)


def _require_q(params: QueryDict) -> str:
    q = (params.get("q") or "").strip()
    if not q:
        raise ParseError("The q query parameter is required.")
    return q


def _optional_str(params: QueryDict, name: str) -> str | None:
    value = (params.get(name) or "").strip()
    return value or None


def _int_param(
    params: QueryDict,
    name: str,
    default: int,
    ge: int | None = None,
    le: int | None = None,
) -> int:
    raw = params.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ParseError(f"The {name} query parameter must be an integer.") from None
    if (ge is not None and value < ge) or (le is not None and value > le):
        raise ParseError(f"The {name} query parameter must be between {ge} and {le}.")
    return value


class SearchView(APIView):
    """``GET /search`` — paginated title search across the catalog."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        params = request.query_params
        q = _require_q(params)
        media_type = _optional_str(params, "media_type")
        sort_by = _optional_str(params, "sort_by")
        page = _int_param(params, "page", 1, ge=1)
        page_size = _int_param(params, "page_size", 24, ge=1, le=100)
        include_external = (params.get("include_external") or "").lower() in ("1", "true")
        payload = services.search_media_payload(
            q=q,
            media_type=media_type,
            sort_by=sort_by,
            page=page,
            page_size=page_size,
            include_external=include_external,
        )
        services.log_search(
            query=q,
            media_type=media_type,
            sort_by=sort_by,
            page=page,
            page_size=page_size,
            result_count=payload["total"],
            items_returned=len(payload["items"]),
            tracks_returned=len(payload["tracks"]),
            user=request.user,
            backfill_triggered=bool(payload.get("backfill_pending")),
        )
        return Response(payload)


class SuggestionsView(APIView):
    """``GET /search/suggestions`` — compact title matches for typeahead."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        params = request.query_params
        q = _require_q(params)
        media_type = _optional_str(params, "media_type")
        limit = _int_param(params, "limit", 8, ge=1, le=20)
        return Response(services.suggestions_payload(q=q, media_type=media_type, limit=limit))


class GroupedView(APIView):
    """``GET /search/grouped`` — results grouped by media/people/users."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        params = request.query_params
        q = _require_q(params)
        media_type_limit = _int_param(params, "media_type_limit", 10, ge=1, le=25)
        return Response(services.grouped_payload(q=q, media_type_limit=media_type_limit))


class CompaniesView(APIView):
    """``GET /search/companies`` — company name search."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        params = request.query_params
        q = _require_q(params)
        limit = _int_param(params, "limit", 20, ge=1, le=50)
        return Response(services.companies_payload(q=q, limit=limit))


class PollView(APIView):
    """``GET /search/poll`` — new matches since ``known_ids``."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        params = request.query_params
        q = _require_q(params)
        media_type = _optional_str(params, "media_type")
        known_ids = params.get("known_ids") or ""
        page_size = _int_param(params, "page_size", 24, ge=1, le=50)
        payload = services.poll_payload(
            q=q, media_type=media_type, known_ids=known_ids, page_size=page_size
        )
        return Response(payload)


class ExternalView(APIView):
    """``GET /search/external`` — external game search (IGDB, future work)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        params = request.query_params
        _require_q(params)
        _int_param(params, "limit", 8, ge=1, le=20)
        return Response(services.external_payload())


class ProvidersView(APIView):
    """``POST /search/providers`` — unified provider search (Otix + external)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request: Request) -> Response:
        body = ProviderSearchRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return Response(
            services.providers_payload(
                query=body.validated_data["query"],
                limit=body.validated_data["limit"],
            )
        )


class SteamGridView(APIView):
    """``POST /search/steamgrid`` — SteamGridDB artwork search (future work)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request: Request) -> Response:
        body = SteamGridSearchRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return Response(services.steamgrid_payload(query=body.validated_data["query"]))


class PrehydrateView(APIView):
    """``POST /search/prehydrate`` — IGDB ingest for scanned game titles.

    Runs the catalog search/backfill inline so a scan-time list hydrates even
    when a Celery worker is not attached.
    """

    def post(self, request: Request) -> Response:
        titles = request.data.get("titles") if isinstance(request.data, dict) else None
        if not isinstance(titles, list):
            raise ParseError("titles list is required.")
        result = services.prehydrate_game_titles([str(title) for title in titles if title])
        return Response({"queued": result["searched"], **result})


class SemanticSearchView(APIView):
    """``POST /api/v1/search/semantic``

    Execute vector cosine distance search over precomputed media catalog embeddings.
    Accepts raw 1024-dimensional query vector list.
    """

    permission_classes = (permissions.AllowAny,)

    def post(self, request: Request) -> Response:
        vector = request.data.get("vector")
        if not vector or not isinstance(vector, list) or len(vector) != 1024:
            raise ParseError("A 1024-dimensional vector list is required.")

        media_type = _optional_str(request.query_params, "media_type")
        limit = _int_param(request.query_params, "limit", 24, ge=1, le=100)

        payload = services.semantic_search_payload(
            vector=vector,
            media_type=media_type,
            limit=limit,
        )
        return Response(payload)
