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
        libraries = integrations_services.list_plex_libraries(request.user)
        if not libraries and getattr(request.user, "plex_auth_token", None):
            try:
                servers = integrations_services.discover_plex_servers(request.user)
                for server in servers:
                    try:
                        integrations_services.discover_plex_libraries(request.user, server)
                    except Exception:
                        pass
                libraries = integrations_services.list_plex_libraries(request.user)
            except Exception:
                pass
        return Response({"libraries": libraries})


class PlexStreamableIdsView(APIView):
    """GET /integrations/plex/streamable-ids — all catalog media IDs streamable by the user."""

    def get(self, request):
        if not getattr(request.user, "plex_id", None):
            return Response({"media_ids": []})
        from apps.integrations.models import UserPlexItem

        items = UserPlexItem.objects.filter(user=request.user).values_list("media_item_id", "guids")
        ids = set()
        for media_item_id, guids in items:
            if media_item_id:
                ids.add(str(media_item_id))
            if guids and isinstance(guids, dict):
                tmdb = guids.get("tmdb")
                if tmdb:
                    ids.add(str(tmdb))
        return Response({"media_ids": list(ids)})


class PlexConnectInfoView(APIView):
    """GET /integrations/plex/connect-info/{media_identifier}"""

    def get(self, request, media_identifier: str):
        season = request.query_params.get("season")
        episode = request.query_params.get("episode")
        tmdb_id = request.query_params.get("tmdb_id") or request.query_params.get("tmdbId")
        title = request.query_params.get("title")
        imdb_id = request.query_params.get("imdb_id") or request.query_params.get("imdbId")
        tvdb_id = request.query_params.get("tvdb_id") or request.query_params.get("tvdbId")
        year = request.query_params.get("year")
        media_type = request.query_params.get("media_type") or request.query_params.get("type")
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
                year=year,
                media_type=media_type,
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
    """GET /integrations/plex/continue-watching
    DELETE /integrations/plex/continue-watching
    """

    def get(self, request):
        if not getattr(request.user, "plex_auth_token", None) and not getattr(
            request.user, "plex_id", None
        ):
            return Response({"items": []})
        return Response({"items": integrations_services.get_plex_continue_watching(request.user)})

    def delete(self, request):
        if not getattr(request.user, "plex_auth_token", None) and not getattr(
            request.user, "plex_id", None
        ):
            return Response({"detail": "No Plex account linked"}, status=400)

        rating_key = request.data.get("rating_key") or request.query_params.get("rating_key")
        server_id = request.data.get("server_id") or request.query_params.get("server_id")

        if not rating_key:
            return Response({"detail": "rating_key is required"}, status=400)

        success = integrations_services.remove_plex_continue_watching(
            request.user,
            rating_key=str(rating_key),
            server_id=server_id,
        )
        return Response({"success": success})


class PlexScrobbleView(APIView):
    """POST /integrations/plex/scrobble — mark media item as watched/unwatched on Plex.

    Accepts:
    - rating_key: str (required)
    - watched: bool (default True)
    - server_id: str (optional)
    """

    def post(self, request):
        if not getattr(request.user, "plex_auth_token", None) and not getattr(
            request.user, "plex_id", None
        ):
            return Response({"detail": "No Plex account linked"}, status=400)

        rating_key = request.data.get("rating_key")
        watched = request.data.get("watched", True)
        if isinstance(watched, str):
            watched = watched.lower() in ("true", "1", "yes")
        server_id = request.data.get("server_id")

        if not rating_key:
            return Response({"detail": "rating_key is required"}, status=400)

        success = integrations_services.scrobble_plex_item(
            request.user,
            rating_key=str(rating_key),
            watched=bool(watched),
            server_id=server_id,
        )
        return Response({"success": success})

    def delete(self, request):
        if not getattr(request.user, "plex_auth_token", None) and not getattr(
            request.user, "plex_id", None
        ):
            return Response({"detail": "No Plex account linked"}, status=400)

        rating_key = request.data.get("rating_key") or request.query_params.get("rating_key")
        server_id = request.data.get("server_id") or request.query_params.get("server_id")

        if not rating_key:
            return Response({"detail": "rating_key is required"}, status=400)

        success = integrations_services.scrobble_plex_item(
            request.user,
            rating_key=str(rating_key),
            watched=False,
            server_id=server_id,
        )
        return Response({"success": success})


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
        session_id = request.data.get("session_id")
        local_only = bool(request.data.get("local_only", False))

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
            session_id=session_id,
            local_only=local_only,
            user=request.user,
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


class PlexWatchedSyncView(APIView):
    """POST /integrations/plex/watched/sync — sync watched movies, shows, and episodes from Plex."""

    def post(self, request):
        if not request.user.plex_id:
            return Response({"detail": "No Plex account linked"}, status=400)
        try:
            result = integrations_services.sync_plex_watched(request.user)
        except Exception:
            logger.exception("plex watched sync failed unexpectedly")
            return Response(
                {"detail": "Failed to sync Plex watched media. Please try again."},
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
    last_item = library.items.filter(user=library.user).order_by("-updated_at").first()
    return {
        "id": library.id,
        "server_id": library.server_id,
        "server_name": library.server.name if library.server else "",
        "section_key": library.section_key,
        "title": library.title,
        "library_type": library.library_type,
        "selected": library.selected,
        "item_count": library.items.filter(user=library.user).count(),
        "last_synced_at": last_item.updated_at.isoformat() if last_item else None,
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


class PlexAlbumTracksView(APIView):
    """GET /integrations/plex/album-tracks/{media_identifier}"""

    def get(self, request, media_identifier: str):
        try:
            data = integrations_services.get_plex_album_tracks(
                request.user, media_identifier
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        except integrations_services.PlexAlbumTracksFetchError as exc:
            return Response({"detail": exc.detail}, status=502)
        return Response(data)


class PlexMusicSectionsView(APIView):
    """GET /integrations/plex/music/sections
    POST /integrations/plex/music/sections — live discovery scan
    """

    def get(self, request):
        sections = integrations_services.get_plex_music_sections(request.user)
        # If no sections are stored and the user has Plex connected, auto-discover
        if not sections and (
            getattr(request.user, "plex_auth_token", None)
            or getattr(request.user, "plex_id", None)
        ):
            try:
                servers = list(UserPlexServer.objects.filter(user=request.user))
                if not servers:
                    servers = integrations_services.discover_plex_servers(request.user)
                for server in servers:
                    try:
                        integrations_services.discover_plex_libraries(request.user, server)
                    except Exception:
                        pass
                sections = integrations_services.get_plex_music_sections(request.user)
            except Exception:
                pass
        return Response({"sections": sections})

    def post(self, request):
        """Force a live discovery scan of Plex servers & music libraries."""
        if not (
            getattr(request.user, "plex_auth_token", None)
            or getattr(request.user, "plex_id", None)
        ):
            return Response({"detail": "No Plex account linked", "sections": []}, status=400)
        try:
            servers = integrations_services.discover_plex_servers(request.user)
            for server in servers:
                try:
                    integrations_services.discover_plex_libraries(request.user, server)
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("Plex discovery error during music section scan: %s", exc)

        sections = integrations_services.get_plex_music_sections(request.user)
        return Response({"sections": sections})


class PlexMusicBrowseView(APIView):
    """GET /integrations/plex/music/browse"""

    def get(self, request):
        library_id = request.query_params.get("library_id") or request.query_params.get("libraryId")
        if not library_id:
            sections = integrations_services.get_plex_music_sections(request.user)
            if not sections:
                return Response({"items": [], "sections": []})
            library_id = sections[0]["id"]

        browse_type = (
            request.query_params.get("browse_type")
            or request.query_params.get("browseType")
            or "albums"
        )
        query = request.query_params.get("query") or request.query_params.get("q") or ""
        artist_rating_key = (
            request.query_params.get("artist_rating_key")
            or request.query_params.get("artistRatingKey")
            or ""
        )

        limit_param = request.query_params.get("limit")
        offset_param = request.query_params.get("offset")
        limit = int(limit_param) if limit_param and limit_param.isdigit() else 60
        offset = int(offset_param) if offset_param and offset_param.isdigit() else 0

        try:
            data = integrations_services.browse_plex_music(
                request.user,
                library_id,
                browse_type=browse_type,
                query=query,
                artist_rating_key=artist_rating_key,
                limit=limit,
                offset=offset,
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        return Response(data)


class PlexMusicAlbumTracksView(APIView):
    """GET /integrations/plex/music/album/{rating_key}"""

    def get(self, request, rating_key: str):
        server_id = request.query_params.get("server_id") or request.query_params.get("serverId") or "0"
        try:
            data = integrations_services.get_plex_album_tracks_by_rating_key(
                request.user, server_id, rating_key
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        except integrations_services.PlexAlbumTracksFetchError as exc:
            return Response({"detail": exc.detail}, status=502)
        return Response(data)


class PlexMusicArtistDetailsView(APIView):
    """GET /integrations/plex/music/artist/{rating_key}"""

    def get(self, request, rating_key: str):
        server_id = request.query_params.get("server_id") or request.query_params.get("serverId") or "0"
        try:
            data = integrations_services.get_plex_artist_details(
                request.user, server_id, rating_key
            )
        except integrations_services.PlexConnectInfoNotFound as exc:
            raise NotFound(exc.detail) from None
        except integrations_services.PlexAlbumTracksFetchError as exc:
            return Response({"detail": exc.detail}, status=502)
        return Response(data)
