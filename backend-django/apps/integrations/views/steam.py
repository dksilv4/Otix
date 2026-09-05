"""Steam integration read endpoints (authed).

``/owned-appids`` returns the set of Steam app IDs captured from a past library
scan (read over ``UserSteamGame``) — used by the Steam plugin for free-to-keep
ownership cross-reference. Scanning itself is deferred (task #6).
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import UserSteamGame


class SteamOwnedAppIdsView(APIView):
    """GET /integrations/steam/owned-appids"""

    def get(self, request):
        appids = list(
            UserSteamGame.objects.filter(user=request.user).values_list(
                "steam_app_id", flat=True
            )
        )
        return Response({"appids": appids})
