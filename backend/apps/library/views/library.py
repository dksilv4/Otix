"""Library API views: installed/plex/steam/epic/youtube/tab read surfaces.

All routes are authenticated (global ``IsAuthenticated`` default); thin APIView
subclasses that delegate query work to ``apps.library.services`` and response
shaping to ``apps.library.serializers``. Status codes mirror the legacy FastAPI
routers: 200 reads, 404 with the legacy ``detail`` string where a provider is
not connected or a row is missing, and a 307 redirect for the plex thumb.
"""

from django.http.response import HttpResponseRedirectBase
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library import services
from apps.library.serializers import (
    EpicUnmatchedGameSerializer,
    InstalledGameSerializer,
    MediaItemSummarySerializer,
    SteamUnmatchedGameSerializer,
    SteamWishlistItemSerializer,
    YoutubeLikedVideoSerializer,
)
from apps.media.models import MediaItem

STEAM_NOT_CONNECTED = "Steam library is only available when Steam is connected"
PLEX_NOT_CONNECTED = "Plex library is only available when Plex is connected"


class _TemporaryRedirect(HttpResponseRedirectBase):
    """307 Temporary Redirect (legacy FastAPI ``RedirectResponse`` default)."""

    status_code = 307


def _int_param(request: Request, name: str, default: int, low: int, high: int) -> int:
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, value))


def _media_list_payload(items: list[MediaItem], has_more: bool, next_cursor: str | None) -> dict:
    """Assemble the legacy ``MediaItemListResponse`` envelope."""
    return {
        "items": [MediaItemSummarySerializer(item).data for item in items],
        "next_cursor": next_cursor,
        "has_more": has_more,
        "total": None,
        "tracks": [],
        "backfill_pending": False,
    }


class InstalledGamesView(APIView):
    """``GET /api/v1/library/installed`` — locally installed desktop games."""

    def get(self, request: Request) -> Response:
        limit = _int_param(request, "limit", default=50, low=1, high=200)
        offset = _int_param(request, "offset", default=0, low=0, high=1_000_000)
        games, total = services.get_installed_games(request.user, limit, offset)
        return Response({"games": InstalledGameSerializer(games, many=True).data, "total": total})


class PlexLibraryView(APIView):
    """``GET /api/v1/library/plex`` — the user's Plex library grid."""

    def get(self, request: Request) -> Response:
        if not request.user.plex_id:
            raise NotFound(PLEX_NOT_CONNECTED)
        limit = _int_param(request, "limit", default=48, low=1, high=100)
        items, has_more, next_cursor = services.get_plex_library(
            request.user,
            cursor=request.query_params.get("cursor"),
            limit=limit,
            media_type=request.query_params.get("media_type"),
            sort_by=request.query_params.get("sort_by"),
        )
        return Response(_media_list_payload(items, has_more, next_cursor))


class PlexStatusView(APIView):
    """``GET /api/v1/library/plex/status`` — plex item count + last scanned."""

    def get(self, request: Request) -> Response:
        return Response(services.get_plex_status(request.user))


class PlexThumbView(APIView):
    """``GET /api/v1/library/plex/thumb/{media_item_id}`` — redirect to Plex.

    The redirect target is built entirely from DB-backed plex item/server rows;
    the client performs the actual Plex HTTP fetch (legacy behaviour).
    """

    def get(self, request: Request, media_item_id: str) -> Response:
        try:
            url = services.get_plex_thumb_url(request.user, media_item_id)
        except services.PlexThumbError as exc:
            raise NotFound(exc.detail) from None
        return _TemporaryRedirect(url)


class SteamLibraryView(APIView):
    """``GET /api/v1/library/steam`` — matched Steam games grid."""

    def get(self, request: Request) -> Response:
        if not request.user.steam_id:
            raise NotFound(STEAM_NOT_CONNECTED)
        limit = _int_param(request, "limit", default=48, low=1, high=100)
        items, has_more, next_cursor = services.get_steam_library(
            request.user, cursor=request.query_params.get("cursor"), limit=limit
        )
        return Response(_media_list_payload(items, has_more, next_cursor))


class SteamStatusView(APIView):
    """``GET /api/v1/library/steam/status`` — steam game count + last scanned."""

    def get(self, request: Request) -> Response:
        return Response(services.get_steam_status(request.user))


class SteamUnmatchedView(APIView):
    """``GET /api/v1/library/steam/unmatched`` — Steam rows with no Otix match."""

    def get(self, request: Request) -> Response:
        if not request.user.steam_id:
            raise NotFound(STEAM_NOT_CONNECTED)
        limit = _int_param(request, "limit", default=48, low=1, high=100)
        rows, has_more, next_cursor = services.get_unmatched_steam_games(
            request.user, cursor=request.query_params.get("cursor"), limit=limit
        )
        return Response(
            {
                "items": SteamUnmatchedGameSerializer(rows, many=True).data,
                "next_cursor": next_cursor,
                "has_more": has_more,
                "total": None,
            }
        )


class EpicLibraryView(APIView):
    """``GET /api/v1/library/epic`` — matched Epic games grid.

    Unlike Steam, an unlinked user gets an empty list rather than 404; the
    refresh token lives on the Otix Server node, not on ``User``.
    """

    def get(self, request: Request) -> Response:
        limit = _int_param(request, "limit", default=48, low=1, high=100)
        items, has_more, next_cursor = services.get_epic_library(
            request.user, cursor=request.query_params.get("cursor"), limit=limit
        )
        return Response(_media_list_payload(items, has_more, next_cursor))


class EpicStatusView(APIView):
    """``GET /api/v1/library/epic/status`` — epic game count + last scanned."""

    def get(self, request: Request) -> Response:
        return Response(services.get_epic_status(request.user))


class EpicUnmatchedView(APIView):
    """``GET /api/v1/library/epic/unmatched`` — Epic rows with no Otix match."""

    def get(self, request: Request) -> Response:
        limit = _int_param(request, "limit", default=48, low=1, high=100)
        rows, has_more, next_cursor = services.get_unmatched_epic_games(
            request.user, cursor=request.query_params.get("cursor"), limit=limit
        )
        return Response(
            {
                "items": EpicUnmatchedGameSerializer(rows, many=True).data,
                "next_cursor": next_cursor,
                "has_more": has_more,
                "total": None,
            }
        )


class SteamWishlistView(APIView):
    """``GET /api/v1/library/steam/wishlist`` — matched wishlist grid."""

    def get(self, request: Request) -> Response:
        if not request.user.steam_id:
            raise NotFound(STEAM_NOT_CONNECTED)
        limit = _int_param(request, "limit", default=48, low=1, high=100)
        items, has_more, next_cursor = services.get_steam_wishlist(
            request.user, cursor=request.query_params.get("cursor"), limit=limit
        )
        return Response(
            {
                "items": [SteamWishlistItemSerializer(item).data for item in items],
                "next_cursor": next_cursor,
                "has_more": has_more,
                "total": None,
            }
        )


class YoutubeLibraryView(APIView):
    """``GET /api/v1/library/youtube`` — raw YouTube liked videos."""

    def get(self, request: Request) -> Response:
        limit = _int_param(request, "limit", default=50, low=1, high=100)
        rows, has_more, next_cursor = services.get_youtube_library(
            request.user, cursor=request.query_params.get("cursor"), limit=limit
        )
        return Response(
            {
                "items": YoutubeLikedVideoSerializer(rows, many=True).data,
                "next_cursor": next_cursor,
                "has_more": has_more,
            }
        )


class LibraryTabView(APIView):
    """``GET /api/v1/library/{tab}`` — items for one interaction-type tab."""

    def get(self, request: Request, tab: str) -> Response:
        limit = _int_param(request, "limit", default=50, low=1, high=100)
        result = services.get_library_tab(
            request.user,
            tab,
            cursor=request.query_params.get("cursor"),
            limit=limit,
            source=request.query_params.get("source"),
        )
        if result is None:
            raise NotFound(services.UNKNOWN_TAB_DETAIL)
        items, has_more, next_cursor = result
        return Response(_media_list_payload(items, has_more, next_cursor))
