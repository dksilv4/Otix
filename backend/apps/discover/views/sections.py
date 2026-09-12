"""Discover sections view: the discover-page section descriptors."""

from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.discover import services as discover_services


class DiscoverSectionsView(APIView):
    """GET /discover/sections — public, optional user.

    Returns the discover-page section set. Per-user personalization
    (``compute_profile``/``generate_sections`` preference signals) is part of
    the deferred personalization engine, so both anonymous and authed callers
    receive the static canonical sections (each resolving to an already-ported
    discover list_type feed).
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request) -> Response:
        return Response({"sections": discover_services.default_sections()})
