"""Epic integration endpoints (authed).

``GET /status`` proxies the node's Epic connection payload and strips any
``refresh_token``. ``POST /scan`` fetches owned games from the user's Otix
Server and upserts ``UserEpicGame`` rows, matching catalog IDs via ``epic``
``ExternalID`` (no IGDB on scan).
"""

import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services
from apps.library.services.game_server import (
    NO_EPIC_NODE,
    pick_online_game_server,
    proxy_epic_status,
)

logger = logging.getLogger(__name__)

_SCAN_FAILED = "Failed to scan Epic library. Please try again."


class EpicStatusView(APIView):
    """GET /integrations/epic/status"""

    def get(self, request):
        server = pick_online_game_server(request.user)
        if server is None:
            return Response({"detail": NO_EPIC_NODE}, status=400)
        status_code, data = proxy_epic_status(server)
        if isinstance(data, dict):
            data.pop("refresh_token", None)
        return Response(data, status=status_code)


class EpicLibraryScanView(APIView):
    """POST /integrations/epic/scan — capture the user's Epic library."""

    def post(self, request):
        try:
            result = integrations_services.scan_epic_library(request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception:
            logger.exception("epic library scan failed")
            return Response({"detail": _SCAN_FAILED}, status=500)
        return Response(result)


class EpicResolveSteamGridView(APIView):
    """POST /integrations/epic/resolve-steamgrid — resolve unmatched games via SteamGridDB."""

    def post(self, request):
        from apps.integrations.services.epic_steamgrid import resolve_unmatched_epic_with_steamgrid

        limit = request.data.get("limit")
        if limit is not None:
            try:
                limit = int(limit)
            except (ValueError, TypeError):
                limit = None
        try:
            result = resolve_unmatched_epic_with_steamgrid(
                request.user,
                limit=limit,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception:
            logger.exception("epic steamgrid resolution failed")
            return Response(
                {"detail": "Failed to resolve games with SteamGridDB."},
                status=500,
            )
        return Response(result)

