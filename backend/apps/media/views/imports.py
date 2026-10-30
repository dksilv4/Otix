"""Import / match / rehydrate / sync-local-games endpoints."""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
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


def _empty_match(game) -> dict:
    if not isinstance(game, dict):
        return import_service.empty_game_match("", "")
    return import_service.empty_game_match(
        str(game.get("query_id") or ""),
        str(game.get("title") or game.get("query_title") or ""),
    )


class RehydrateView(APIView):
    """``POST /media/{media_id}/rehydrate`` — admin; enqueues a P0 catalog job."""

    def post(self, request, media_id: int) -> Response:
        _require_admin(request.user)
        item = _media_or_404(media_id)
        from apps.integrations.services.catalog_seed import ensure_catalog_job
        from apps.media.services.catalog_lifecycle import canonical_external_id
        from apps.media.services.identity import CANONICAL_PROVIDER

        provider = CANONICAL_PROVIDER.get(item.media_type)
        ext = canonical_external_id(item)
        if not provider or not ext:
            raise ValidationError("Media item has no canonical catalog id")
        job = ensure_catalog_job(provider, item.media_type, ext, priority=0, force=True)
        return Response({"task_id": str(job.pk) if job is not None else ""})


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
    """``POST /media/import/igdb?igdb_id=...`` — seed from IGDB when missing."""

    def post(self, request) -> Response:
        raw = request.query_params.get("igdb_id")
        try:
            igdb_id = int(raw) if raw else None
        except (TypeError, ValueError):
            raise ValidationError("igdb_id must be an integer") from None
        if igdb_id is None:
            raise ValidationError("igdb_id query parameter is required")
        item = import_service.import_igdb_game(igdb_id)
        if item is None:
            raise NotFound("IGDB game not found or import failed")
        return Response(import_service.import_response("igdb", str(igdb_id), item))


class MatchGameView(APIView):
    """``POST /media/match`` — resolve one scanned/local title to the catalog."""

    def post(self, request) -> Response:
        game = request.data if isinstance(request.data, dict) else {}
        return Response(import_service.match_game_payload(game))


class MatchBatchView(APIView):
    """``POST /media/match/batch`` — resolve scanned/local titles to the catalog."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        return Response(import_service.match_games_payload(games))


class MatchStreamView(MatchBatchView):
    """``POST /media/match/stream`` — same batch matcher as ``/match/batch``."""


class MatchScanView(APIView):
    """``POST /media/match/scan`` — resolve scanned/local titles to the catalog."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        return Response(import_service.match_games_payload(games))


class MatchConfirmView(APIView):
    """``POST /media/match/confirm`` — link a local, Steam, or Epic game to a catalog item."""

    def post(self, request) -> Response:
        from django.contrib.contenttypes.models import ContentType

        from apps.integrations.models import UserEpicGame, UserSteamGame
        from apps.library.models import UserLocalGame
        from apps.media.models import ExternalID, MediaItem

        data = request.data or {}
        query_id = str(data.get("query_id") or "").strip()
        media_item_id = data.get("media_item_id")
        igdb_id = data.get("igdb_id")
        rejected = bool(data.get("rejected") or data.get("rejected_permanently"))

        if rejected:
            return Response({"success": True, "media_item_id": None})

        media_item = None
        if media_item_id is not None:
            try:
                media_item = MediaItem.objects.filter(pk=int(media_item_id)).first()
            except (TypeError, ValueError):
                pass

        if media_item is None and igdb_id is not None:
            try:
                media_item = import_service.import_igdb_game(int(igdb_id))
            except (TypeError, ValueError):
                pass

        if media_item is None:
            return Response(
                {
                    "success": False,
                    "error": "Catalog media item not found or could not be imported.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = ContentType.objects.get_for_model(MediaItem)

        # 1. Steam matching
        if query_id.startswith("steam:"):
            target = query_id.split(":", 1)[1].strip()
            steam_row = None
            if target.startswith("steam-unmatched-"):
                try:
                    steam_row = UserSteamGame.objects.filter(
                        user=request.user, id=int(target.replace("steam-unmatched-", ""))
                    ).first()
                except (TypeError, ValueError):
                    pass
            elif target.startswith("steam-"):
                try:
                    steam_row = UserSteamGame.objects.filter(
                        user=request.user, id=int(target.replace("steam-", ""))
                    ).first()
                except (TypeError, ValueError):
                    pass
            if steam_row is None:
                try:
                    appid = int(target)
                    steam_row = UserSteamGame.objects.filter(
                        user=request.user, steam_app_id=appid
                    ).first()
                    if steam_row is None:
                        steam_row = UserSteamGame.objects.filter(
                            user=request.user, id=appid
                        ).first()
                except (TypeError, ValueError):
                    pass

            if steam_row is not None:
                steam_row.media_item_id = media_item.id
                steam_row.save(update_fields=("media_item_id", "updated_at"))
                ExternalID.objects.get_or_create(
                    content_type=content_type,
                    provider="steam",
                    external_id=str(steam_row.steam_app_id),
                    media_type="game",
                    defaults={"object_id": media_item.id},
                )
                from apps.media.services.interaction import set_interaction

                set_interaction(request.user, media_item.id, "owned")
                return Response({"success": True, "media_item_id": str(media_item.id)})

        # 2. Epic matching
        elif query_id.startswith("epic:"):
            target = query_id.split(":", 1)[1].strip()
            epic_row = None
            if target.startswith("epic-unmatched-"):
                try:
                    epic_row = UserEpicGame.objects.filter(
                        user=request.user, id=int(target.replace("epic-unmatched-", ""))
                    ).first()
                except (TypeError, ValueError):
                    pass
            if epic_row is None:
                epic_row = UserEpicGame.objects.filter(user=request.user, app_name=target).first()
            if epic_row is None:
                epic_row = UserEpicGame.objects.filter(
                    user=request.user, catalog_item_id=target
                ).first()

            if epic_row is not None:
                epic_row.media_item_id = media_item.id
                epic_row.save(update_fields=("media_item_id", "updated_at"))
                ExternalID.objects.get_or_create(
                    content_type=content_type,
                    provider="epic",
                    external_id=str(epic_row.app_name),
                    media_type="game",
                    defaults={"object_id": media_item.id},
                )
                from apps.media.services.interaction import set_interaction

                set_interaction(request.user, media_item.id, "owned")
                return Response({"success": True, "media_item_id": str(media_item.id)})

        # 3. Local game matching
        local_row = None
        if query_id:
            platform = "pc"
            title_part = query_id
            if ":" in query_id:
                platform, title_part = query_id.split(":", 1)
            local_row = UserLocalGame.objects.filter(
                user=request.user, title__iexact=title_part
            ).first()

        if local_row is not None:
            local_row.media_item_id = media_item.id
            local_row.save(update_fields=("media_item_id", "updated_at"))
            from apps.media.services.interaction import set_interaction

            set_interaction(request.user, media_item.id, "owned")
            return Response({"success": True, "media_item_id": str(media_item.id)})

        if request.user.is_authenticated:
            from apps.media.services.interaction import set_interaction

            set_interaction(request.user, media_item.id, "owned")

        return Response({"success": True, "media_item_id": str(media_item.id)})


class MatchUnlinkView(APIView):
    """``POST /media/match/unlink?query_id=...`` — unlink a game from catalog."""

    def post(self, request) -> Response:
        from apps.integrations.models import UserEpicGame, UserSteamGame

        query_id = request.query_params.get("query_id") or request.data.get("query_id")
        if not query_id:
            raise ValidationError("query_id parameter is required")

        if query_id.startswith("steam:"):
            target = query_id.split(":", 1)[1].strip()
            steam_row = None
            if target.startswith("steam-"):
                try:
                    steam_row = UserSteamGame.objects.filter(
                        user=request.user,
                        id=int(target.replace("steam-unmatched-", "").replace("steam-", "")),
                    ).first()
                except (TypeError, ValueError):
                    pass
            if steam_row is None:
                try:
                    appid = int(target)
                    steam_row = UserSteamGame.objects.filter(
                        user=request.user, steam_app_id=appid
                    ).first()
                except (TypeError, ValueError):
                    pass
            if steam_row is not None:
                steam_row.media_item_id = None
                steam_row.save(update_fields=("media_item_id", "updated_at"))
                return Response({"success": True, "media_item_id": None})

        elif query_id.startswith("epic:"):
            target = query_id.split(":", 1)[1].strip()
            epic_row = UserEpicGame.objects.filter(user=request.user, app_name=target).first()
            if epic_row is not None:
                epic_row.media_item_id = None
                epic_row.save(update_fields=("media_item_id", "updated_at"))
                return Response({"success": True, "media_item_id": None})

        return Response({"success": True, "media_item_id": None})


class SyncLocalGamesView(APIView):
    """``POST /media/sync-local-games`` — upsert/delete local game rows."""

    def post(self, request) -> Response:
        games = request.data.get("games") if isinstance(request.data, dict) else None
        if not isinstance(games, list):
            raise ValidationError("games list is required")
        try:
            result = services.sync_local_games(request.user, games)
        except (DjangoValidationError, IntegrityError, ValueError) as exc:
            raise ValidationError(str(exc)) from None
        return Response(result, status=status.HTTP_200_OK)
