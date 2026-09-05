"""Plex integration read endpoints (library-state, authed).

``/libraries`` lists the user's discovered Plex libraries with item counts;
``/connect-info/{media_item_id}`` returns connect details (base URLs + token +
thumb URL) for the user's scanned copy of a catalog media item. Both are pure
reads over the stored ``UserPlex*`` rows — no live Plex sync (deferred).
"""

from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services


class PlexLibrariesView(APIView):
    """GET /integrations/plex/libraries"""

    def get(self, request):
        return Response(
            {"libraries": integrations_services.list_plex_libraries(request.user)}
        )


class PlexConnectInfoView(APIView):
    """GET /integrations/plex/connect-info/{media_item_id}"""

    def get(self, request, media_item_id: int):
        try:
            data = integrations_services.get_plex_connect_info(
                request.user, media_item_id
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        return Response(data)
