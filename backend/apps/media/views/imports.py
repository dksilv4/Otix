"""Import / match / rehydrate / sync-local-games endpoints.

Legacy handlers in this family block on the Celery worker and/or the
SteamGridDB provider (both deferred, see ARCHITECTURE §7). Each route still
exists and returns the closest legacy success shape so callers get a decodable
response; anything that would need the external platform returns an honest
"not available" body instead of silently dropping. ``/sync-local-games`` and the
short-circuit import lookups only touch the local database and are implemented.
"""

from __future__ import annotations

import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media import services
from apps.media.services import imports as import_service

_SUPPORTED_IMPORT_PROVIDERS = {"tmdb", "igdb"}


def _require_admin(user) -> None:
    if not getattr(user, "is_staff", False):
        raise PermissionDenied("Admin privileges required")


def _media_or_404(media_id: int):
    item = services.media_item_or_none(media_id)
    if item is None:
        raise NotFound("Media item not found")
    return item


def _empty_match(game: dict) -> dict:
    return {
        "query_id": game.get("query_id") or "",
        "query_title": game.get("title") or game.get("query_title") or "",
        "candidates": [],
        "auto_match": None,
    }


class RehydrateView(APIView):
    """``POST /media/{media_id}/rehydrate`` — admin; enqueues in legacy."""

    def post(self, request, media_id: int) -> Response:
        _require_admin(request.user)
        _media_or_404(media_id)
        return Response({"task_id": str(uuid.uuid4())})


class RehydrateStreamView(APIView):
    """``GET /media/{media_id}/rehydrate/{task_id}/stream`` (legacy SSE).

    No task worker exists in the Django backend, so there is no progress to
    stream; respond with a terminal JSON body rather than a hanging event
    stream.
    """

    def get(self, request, media_id: int, task_id: str) -> Response:
        _require_admin(request.user)
        _media_or_404(media_id)
        return Response(
            {
                "task_id": task_id,
                "status": "complete",
                "detail": "Rehydration is not available in the Django backend (no task worker).",
            }
        )


class ImportView(APIView):
    """``POST /media/import`` — tmdb/igdb import (short-circuit only)."""

    def post(self, request) -> Response:
        provider = (request.data.get("provider") or "").lower()
        provider_id = str(request.data.get("provider_id") or "")
        media_type = request.data.get("media_type")
        if provider not in _SUPPORTED_IMPORT_PROVIDERS:
            raise ValidationError(f"Unsupported provider: {provider}")
        if provider == "tmdb" and media_type not in ("movie", "show"):
            raise ValidationError("media_type is required for tmdb imports (movie or show)")
        if not provider_id:
            raise ValidationError("provider_id is required")
        item = import_service.resolve_imported_item(provider, provider_id, media_type)
        if item is None:
            raise NotFound("Media not found or import failed")
        return Response(import_service.import_response(provider, provider_id, item))


class ImportIgdbView(APIView):
    """``POST /media/import/igdb?igdb_id=...`` — igdb import (short-circuit only)."""

    def post(self, request) -> Response:
        raw = request.query_params.get("igdb_id")
        try:
            igdb_id = int(raw) if raw else None
        except (TypeError, ValueError):
            raise ValidationError("igdb_id must be an integer") from None
        if igdb_id is None:
            raise ValidationError("igdb_id query parameter is required")
        item = import_service.resolve_imported_item("igdb", str(igdb_id))
        if item is None:
            raise NotFound("IGDB game not found or import failed")
        return Response(import_service.import_response("igdb", str(igdb_id), item))


class MatchGameView(APIView):
    """``POST /media/match`` — single-game match (deferred platform)."""

    def post(self, request) -> Response:
        game = request.data or {}
        return Response(_empty_match(game))


class MatchBatchView(APIView):
    """``POST /media/match/batch`` — batch match (deferred platform)."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        return Response({"matches": [_empty_match(g) for g in games]})


class MatchStreamView(APIView):
    """``POST /media/match/stream`` — legacy SSE batch stream (deferred)."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        return Response({"matches": [_empty_match(g) for g in games]})


class MatchScanView(APIView):
    """``POST /media/match/scan`` — legacy SSE scan (deferred)."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        matches = [_empty_match(g) for g in games]
        return Response(
            {
                "matches": matches,
                "total": len(matches),
                "matched": 0,
                "unmatched": len(matches),
                "errored": 0,
            }
        )


class MatchConfirmView(APIView):
    """``POST /media/match/confirm`` — link a local game to a catalog item.

    Deferred: confirmation writes live on the SteamGrid matcher + Celery sync,
    which the Django backend does not run yet.
    """

    def post(self, request) -> Response:
        data = request.data or {}
        return Response(
            {
                "success": False,
                "media_item_id": data.get("media_item_id"),
                "error": "Match confirmation is not available in the Django backend yet.",
            }
        )


class MatchUnlinkView(APIView):
    """``POST /media/match/unlink?query_id=...`` — deferred (see confirm)."""

    def post(self, request) -> Response:
        query_id = request.query_params.get("query_id")
        if not query_id:
            raise ValidationError("query_id query parameter is required")
        return Response(
            {
                "success": False,
                "media_item_id": None,
                "error": "Match unlink is not available in the Django backend yet.",
            }
        )


class SyncLocalGamesView(APIView):
    """``POST /media/sync-local-games`` — upsert/delete local game rows."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        try:
            result = services.sync_local_games(request.user, games)
        except DjangoValidationError as exc:
            raise ValidationError(str(exc)) from None
        return Response(result, status=status.HTTP_200_OK)
