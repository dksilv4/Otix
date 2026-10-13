"""Plex integration read endpoints (library-state + playback, authed).

``/libraries`` lists the user's discovered Plex libraries with item counts;
``/connect-info/{media_item_id}`` returns connect details (base URLs + token +
thumb URL) for the user's scanned copy of a catalog media item; both are pure
reads over the stored ``UserPlex*`` rows. ``/servers`` discovers the user's
servers + libraries live from plex.tv. ``/stream/{rating_key}`` 302-redirects
to a signed browser-streamable URL for a media item. ``/album-tracks/{media_item_id}``
fetches a music album's track list and ``/sessions`` active playback, live from
the user's Plex server.
"""

import logging

from django.http import HttpResponse
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services
from apps.integrations.models import UserPlexServer

logger = logging.getLogger(__name__)

# Matches ``accounts.services.oauth._PLEX_TOKEN_COLUMNS`` — the legacy
# ``unlink_plex_quietly`` field set. Notifications dispatch is deferred to the
# platform wave.
_PLEX_DISCONNECT_COLUMNS = (
    "plex_id",
    "plex_username",
    "plex_email",
    "plex_thumb",
    "plex_auth_token",
)


def _quietly_unlink_plex(user) -> None:
    """Clear the user's Plex link without raising (legacy ``unlink_plex_quietly``)."""
    if user.plex_id is None:
        return
    for column in _PLEX_DISCONNECT_COLUMNS:
        setattr(user, column, None)
    user.save(update_fields=_PLEX_DISCONNECT_COLUMNS)


class PlexLibrariesView(APIView):
    """GET /integrations/plex/libraries"""

    def get(self, request):
        return Response({"libraries": integrations_services.list_plex_libraries(request.user)})


class PlexConnectInfoView(APIView):
    """GET /integrations/plex/connect-info/{media_identifier}"""

    def get(self, request, media_identifier: str):
        season = request.query_params.get("season")
        episode = request.query_params.get("episode")
        tmdb_id = request.query_params.get("tmdb_id") or request.query_params.get("tmdbId")
        title = request.query_params.get("title")
        imdb_id = request.query_params.get("imdb_id") or request.query_params.get("imdbId")
        tvdb_id = request.query_params.get("tvdb_id") or request.query_params.get("tvdbId")
        try:
            data = integrations_services.get_plex_connect_info(
                request.user,
                media_identifier,
                season=season,
                episode=episode,
                tmdb_id=tmdb_id,
                title=title,
                imdb_id=imdb_id,
                tvdb_id=tvdb_id,
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        response = Response(data)
        server_timings = data.get("server_timings")
        if server_timings:
            response["Server-Timing"] = server_timings
        return response


class PlexSessionsView(APIView):
    """GET /integrations/plex/sessions"""

    def get(self, request):
        if not request.user.plex_auth_token:
            return Response({"detail": "No Plex account linked"}, status=400)
        return Response(
            {
                "sessions": integrations_services.get_plex_sessions(request.user),
                "is_admin": integrations_services.is_plex_admin(request.user),
            }
        )


class PlexContinueWatchingView(APIView):
    """GET /integrations/plex/continue-watching"""

    def get(self, request):
        if not getattr(request.user, "plex_auth_token", None) and not getattr(
            request.user, "plex_id", None
        ):
            return Response({"items": []})
        return Response(
            {"items": integrations_services.get_plex_continue_watching(request.user)}
        )


class PlexTimelineView(APIView):
    """POST /integrations/plex/timeline — report playback progress to Plex."""

    def post(self, request):
        server_url = request.data.get("server_url")
        token = request.data.get("token") or request.user.plex_auth_token
        rating_key = request.data.get("rating_key")
        state = request.data.get("state", "playing")
        time_ms = int(request.data.get("time_ms", 0))
        duration_ms = int(request.data.get("duration_ms", 0))
        client_id = request.data.get("client_id") or "otix-web-player"

        if not server_url or not rating_key:
            return Response({"detail": "server_url and rating_key are required"}, status=400)

        success = integrations_services.report_plex_timeline(
            server_url=server_url,
            token=token,
            rating_key=rating_key,
            state=state,
            time_ms=time_ms,
            duration_ms=duration_ms,
            client_id=client_id,
        )
        return Response({"success": success})


class PlexWatchlistSyncView(APIView):
    """POST /integrations/plex/watchlist/sync — seed the catalog from the watchlist."""

    def post(self, request):
        if not request.user.plex_id:
            return Response({"detail": "No Plex account linked"}, status=400)
        try:
            result = integrations_services.sync_plex_watchlist(request.user)
        except Exception:
            logger.exception("plex watchlist sync failed unexpectedly")
            return Response(
                {"detail": "Failed to sync Plex watchlist. Please try again."},
                status=500,
            )
        return Response(result)


def _server_row(server) -> dict:
    return {
        "id": server.id,
        "machine_identifier": server.machine_identifier,
        "name": server.name,
        "product": server.product,
        "platform": server.platform,
        "base_url": server.base_url,
        "owned": server.owned,
        "selected": server.selected,
    }


def _library_row(library) -> dict:
    return {
        "id": library.id,
        "server_id": library.server_id,
        "section_key": library.section_key,
        "title": library.title,
        "library_type": library.library_type,
        "selected": library.selected,
    }


class PlexServersView(APIView):
    """GET /integrations/plex/servers — live plex.tv server/library discovery."""

    def get(self, request):
        user = request.user
        try:
            servers = integrations_services.discover_plex_servers(user)
        except integrations_services.PlexNoLinkedAccount as exc:
            return Response({"detail": exc.detail}, status=400)
        except integrations_services.PlexDiscoveryAuthRevoked as exc:
            _quietly_unlink_plex(user)
            return Response({"detail": exc.detail}, status=410)
        except integrations_services.PlexDiscoveryHttpError as exc:
            return Response({"detail": exc.detail}, status=502)
        except integrations_services.PlexDiscoveryTimeout as exc:
            return Response({"detail": exc.detail}, status=504)
        except integrations_services.PlexDiscoveryConnectError as exc:
            return Response({"detail": exc.detail}, status=502)
        except Exception:
            return Response({"detail": integrations_services.DISCOVER_UNEXPECTED}, status=500)

        libraries = []
        unreachable_servers = []
        for server in servers:
            try:
                libraries.extend(integrations_services.discover_plex_libraries(user, server))
            except (
                integrations_services.PlexDiscoveryHttpError,
                integrations_services.PlexDiscoveryTimeout,
                integrations_services.PlexDiscoveryConnectError,
            ):
                unreachable_servers.append(server.name)

        return Response(
            {
                "servers": [_server_row(server) for server in servers],
                "libraries": [_library_row(library) for library in libraries],
                "unreachable_servers": unreachable_servers or None,
            }
        )


class PlexStreamView(APIView):
    """GET /integrations/plex/stream/{rating_key} — 302 to a signed stream URL."""

    def get(self, request, rating_key: str):
        user = request.user
        # Fast path: resolve against an explicit base URL (no discovery).
        base_url_hint = request.query_params.get("base_url")
        if base_url_hint:
            token = user.plex_auth_token
            for server in UserPlexServer.objects.filter(user=user):
                if server.access_token:
                    token = server.access_token
                    break
            if token:
                url = integrations_services.resolve_stream_url_for_server_with_base(
                    base_url_hint, token, rating_key
                )
                if url is not None:
                    return HttpResponse(status=302, headers={"Location": url})

        url = integrations_services.get_plex_stream_url(user, rating_key)
        if url is None:
            raise NotFound("Stream URL not available")
        return HttpResponse(status=302, headers={"Location": url})
