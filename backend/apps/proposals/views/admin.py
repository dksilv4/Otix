"""Admin/moderator read endpoints (mounted at ``/api/v1/admin/``).

Port of ``old-backend/otix/api/admin/**``. Five routes require a staff admin
(deleted-tmdb-ids, hydration, hydration/summary, metrics, stats) mirroring
legacy ``get_current_admin_user``; ``edit-proposals`` mirrors legacy
``get_trusted_or_admin_user``, which our trusted-user approximation collapses
to any authenticated user (see ``services.proposals.is_trusted_user``).
"""

from rest_framework.exceptions import ParseError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.proposals import services
from apps.proposals.serializers import (
    MediaEditProposalOutSerializer,
    TMDBDeletedIDItemSerializer,
)
from apps.proposals.views.proposals import IsAdminUser


def _int_query(request, name: str, default: int, *, ge: int, le: int | None = None) -> int:
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ParseError(f"{name} must be an integer") from None
    if value < ge or (le is not None and value > le):
        raise ParseError(f"{name} out of range")
    return value


class DeletedTMDBIdsView(APIView):
    """``GET /admin/deleted-tmdb-ids`` — deleted-TMDB audit list."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        page = _int_query(request, "page", 1, ge=1)
        page_size = _int_query(request, "page_size", 50, ge=1, le=200)
        media_type = request.query_params.get("media_type") or None
        items, total = services.list_deleted_tmdb_ids(page, page_size, media_type)
        return Response(
            {
                "items": TMDBDeletedIDItemSerializer(items, many=True).data,
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        )


class EditProposalsView(APIView):
    """``GET /admin/edit-proposals`` — media edit-proposal moderation queue."""

    permission_classes = (IsAuthenticated,)

    def get(self, request) -> Response:
        status_filter = request.query_params.get("status") or None
        limit = _int_query(request, "limit", 50, ge=1, le=200)
        offset = _int_query(request, "offset", 0, ge=0)
        items, total, context = services.list_edit_proposals(
            status_filter, limit, offset, request.user
        )
        serializer = MediaEditProposalOutSerializer(
            items, many=True, context={"edit_proposal_context": context}
        )
        return Response({"items": serializer.data, "total": total})


class HydrationView(APIView):
    """``GET /admin/hydration`` — per-item media hydration status."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        data = services.get_hydration_status(
            media_type=request.query_params.get("media_type") or None,
            search=request.query_params.get("search") or None,
            page=_int_query(request, "page", 1, ge=1),
            per_page=_int_query(request, "per_page", 50, ge=1, le=200),
            sort_by=request.query_params.get("sort_by", "completeness_score"),
            sort_dir=request.query_params.get("sort_dir", "asc"),
        )
        return Response(data)


class HydrationSummaryView(APIView):
    """``GET /admin/hydration/summary`` — hydration-run aggregates."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        return Response(services.hydration_summary())


class MetricsView(APIView):
    """``GET /admin/metrics?metric=...&hours=...`` — dashboard time series."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        metric = request.query_params.get("metric")
        if not metric:
            raise ParseError("metric query parameter is required")
        try:
            hours = float(request.query_params.get("hours", 336))
        except (TypeError, ValueError):
            raise ParseError("hours must be a number") from None
        return Response(
            {
                "metric": metric,
                "hours": hours,
                "data": services.get_metrics(metric, hours),
            }
        )


class StatsView(APIView):
    """``GET /admin/stats`` — dashboard statistics."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        return Response(services.get_stats())
