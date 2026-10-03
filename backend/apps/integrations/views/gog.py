"""GOG integration endpoints (authed).

GET /status proxies the node's GOG status or returns user profile info.
POST /scan fetches owned games and upserts UserGOGGame rows.
"""

import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services
from apps.library.models import UserGameServer
from apps.library.services.game_server import (
    pick_online_game_server,
    proxy_gog_status,
)

logger = logging.getLogger(__name__)

_SCAN_FAILED = "Failed to scan GOG library. Please try again."


class GOGStatusView(APIView):
    """GET /integrations/gog/status"""

    def get(self, request):
        if request.user.gog_refresh_token:
            return Response(
                {
                    "connected": True,
                    "account_id": request.user.gog_account_id,
                    "display_name": request.user.gog_display_name,
                },
                status=200,
            )

        node_id = request.query_params.get("node_id") or request.query_params.get("server_id")
        server = None
        if node_id:
            server = UserGameServer.objects.filter(user=request.user, id=node_id).first()
        if server is None:
            server = pick_online_game_server(request.user)

        if server:
            status_code, data = proxy_gog_status(server)
            if isinstance(data, dict):
                data.pop("refresh_token", None)
            return Response(data, status=status_code)

        return Response(
            {"connected": False, "account_id": None, "display_name": None},
            status=200,
        )


class GOGLibraryScanView(APIView):
    """POST /integrations/gog/scan — capture the user's GOG library."""

    def post(self, request):
        node_id = (
            request.data.get("node_id")
            or request.data.get("server_id")
            or request.query_params.get("node_id")
            or request.query_params.get("server_id")
        )
        server = None
        if node_id:
            server = UserGameServer.objects.filter(user=request.user, id=node_id).first()
        auto_resolve_param = request.data.get("auto_resolve")
        if auto_resolve_param is None:
            auto_resolve_param = request.query_params.get("auto_resolve")
        auto_resolve = False
        if auto_resolve_param is not None:
            auto_resolve = str(auto_resolve_param).lower() in ("true", "1", "yes")

        try:
            result = integrations_services.scan_gog_library(
                request.user, server=server, auto_resolve=auto_resolve
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception:
            logger.exception("gog library scan failed")
            return Response({"detail": _SCAN_FAILED}, status=500)
        return Response(result)


class GOGResolveSteamGridView(APIView):
    """POST /integrations/gog/resolve-steamgrid — resolve unmatched games via SteamGridDB."""

    def post(self, request):
        from apps.integrations.services.gog_steamgrid import resolve_unmatched_gog_with_steamgrid

        limit = request.data.get("limit")
        if limit is not None:
            try:
                limit = int(limit)
            except (ValueError, TypeError):
                limit = None
        try:
            result = resolve_unmatched_gog_with_steamgrid(
                request.user,
                limit=limit,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception:
            logger.exception("gog steamgrid resolution failed")
            return Response(
                {"detail": "Failed to resolve games with SteamGridDB."},
                status=500,
            )
        return Response(result)
