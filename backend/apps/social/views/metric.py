"""Metric endpoint.

Legacy ``GET /metric`` (``old-backend/otix/api/user/metrics/router.py``) has no auth
dependency and returns the process metrics registry snapshot, so this route opts
out of the global ``IsAuthenticated`` default with ``AllowAny``.
"""

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services


class MetricView(APIView):
    """``GET /api/v1/metric/`` -- public metrics registry snapshot."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        return Response(services.get_metrics_snapshot())
