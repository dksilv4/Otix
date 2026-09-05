"""Steam integration endpoints (authed).

``/owned-appids`` returns the set of Steam app IDs captured from a past library
scan (read over ``UserSteamGame``). ``/scan`` and ``/wishlist/scan`` fetch the
user's owned games / wishlist live from Steam and upsert ``UserSteamGame`` /
``UserSteamWishlist`` rows, matching appids to catalog games where a ``steam``
``ExternalID`` already exists (IGDB deep-resolution stays deferred).
"""

import logging

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services
from apps.integrations.models import UserSteamGame

logger = logging.getLogger(__name__)

_NO_ACCOUNT = "No Steam account linked"
_NO_KEY = "Steam API key not configured"


class SteamOwnedAppIdsView(APIView):
    """GET /integrations/steam/owned-appids"""

    def get(self, request):
        appids = list(
            UserSteamGame.objects.filter(user=request.user).values_list(
                "steam_app_id", flat=True
            )
        )
        return Response({"appids": appids})


class SteamLibraryScanView(APIView):
    """POST /integrations/steam/scan — capture the user's Steam library."""

    def post(self, request):
        if not request.user.steam_id:
            return Response({"detail": _NO_ACCOUNT}, status=400)
        if not settings.STEAM_API_KEY:
            return Response({"detail": _NO_KEY}, status=503)
        try:
            result = integrations_services.scan_steam_library(request.user)
        except Exception:
            logger.exception("steam library scan failed")
            return Response(
                {"detail": "Failed to scan Steam library. Please try again."}, status=500
            )
        return Response(result)


class SteamWishlistScanView(APIView):
    """POST /integrations/steam/wishlist/scan — capture the user's Steam wishlist."""

    def post(self, request):
        if not request.user.steam_id:
            return Response({"detail": _NO_ACCOUNT}, status=400)
        if not settings.STEAM_API_KEY:
            return Response({"detail": _NO_KEY}, status=503)
        try:
            result = integrations_services.scan_steam_wishlist(request.user)
        except Exception:
            logger.exception("steam wishlist scan failed")
            return Response(
                {"detail": "Failed to scan Steam wishlist. Please try again."}, status=500
            )
        return Response(result)
