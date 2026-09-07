"""TMDb account-sync endpoints (authed).

``/rating-sync`` imports the user's TMDb ratings into Otix and/or exports Otix
ratings to TMDb per the requested ``direction`` (disabled/import/export/
bidirectional), persisting ``user.tmdb_rating_sync_direction`` only on success
(mirrors the legacy router's commit-after-sync). ``/watchlist-import`` pulls
the user's TMDb watchlist into their Otix library. Both require a linked TMDb
account (400) and delegate to ``apps.integrations.services.tmdb``; a fetch-level
network/protocol failure surfaces as a stable 500.
"""

import logging

from django.db import transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services

logger = logging.getLogger(__name__)

_NOT_LINKED = "TMDb account not linked"
_VALID_DIRECTIONS = {"disabled", "import", "export", "bidirectional"}


class TMDbRatingSyncView(APIView):
    """POST /integrations/tmdb/rating-sync"""

    def post(self, request):
        if not request.user.tmdb_session_id:
            return Response({"detail": _NOT_LINKED}, status=400)
        direction = (request.data or {}).get("direction") or "disabled"
        if direction not in _VALID_DIRECTIONS:
            return Response({"detail": f"Invalid direction: {direction}"}, status=400)
        try:
            with transaction.atomic():
                result = integrations_services.sync_tmdb_ratings(request.user, direction)
                request.user.tmdb_rating_sync_direction = direction
                request.user.save(update_fields=("tmdb_rating_sync_direction",))
        except Exception:
            logger.exception("tmdb rating sync failed")
            return Response(
                {"detail": "Failed to sync TMDb ratings. Please try again."}, status=500
            )
        return Response(result)


class TMDbWatchlistImportView(APIView):
    """POST /integrations/tmdb/watchlist-import"""

    def post(self, request):
        if not request.user.tmdb_session_id:
            return Response({"detail": _NOT_LINKED}, status=400)
        try:
            with transaction.atomic():
                result = integrations_services.import_tmdb_watchlist(request.user)
        except Exception:
            logger.exception("tmdb watchlist import failed")
            return Response(
                {"detail": "Failed to import TMDb watchlist. Please try again."}, status=500
            )
        return Response(result)
