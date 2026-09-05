"""Plex integration read endpoints (library-state + playback, authed).

``/libraries`` lists the user's discovered Plex libraries with item counts;
``/connect-info/{media_item_id}`` returns connect details (base URLs + token +
thumb URL) for the user's scanned copy of a catalog media item; both are pure
reads over the stored ``UserPlex*`` rows. ``/album-tracks/{media_item_id}``
fetches a music album's track list live from the user's Plex server.
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


class PlexAlbumTracksView(APIView):
    """GET /integrations/plex/album-tracks/{media_item_id}"""

    def get(self, request, media_item_id: int):
        try:
            data = integrations_services.get_plex_album_tracks(
                request.user, media_item_id
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        except integrations_services.PlexAlbumTracksFetchError as exc:
            return Response({"detail": exc.detail}, status=502)
        return Response(data)
