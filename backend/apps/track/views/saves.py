"""Game save-path endpoints (legacy ``saves.py`` DB-backed handlers).

``GET /saves/locations/{media_item_id}`` and ``POST .../suggest`` both resolve
the game first and 404 with the legacy detail string when it is missing.
"""

from __future__ import annotations

from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.track.serializers import (
    GameSaveLocationsSerializer,
    SaveLocationSuggestionBodySerializer,
    SaveSuggestionResponseSerializer,
)
from apps.track.services import (
    get_save_locations,
    suggest_save_location,
)
from apps.track.services.saves import GAME_NOT_FOUND


class SaveLocationsView(APIView):
    """``GET /saves/locations/{media_item_id}`` — verified + suggested paths."""

    def get(self, request, media_item_id: int) -> Response:
        payload = get_save_locations(media_item_id)
        if payload is None:
            raise NotFound(GAME_NOT_FOUND)
        return Response(GameSaveLocationsSerializer(payload).data)


class SaveLocationSuggestView(APIView):
    """``POST /saves/locations/{media_item_id}/suggest`` — upsert + promote."""

    def post(self, request, media_item_id: int) -> Response:
        body = SaveLocationSuggestionBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        payload = suggest_save_location(
            request.user,
            media_item_id,
            platform=body.validated_data["platform"],
            path_pattern=body.validated_data["path_pattern"],
        )
        if payload is None:
            raise NotFound(GAME_NOT_FOUND)
        return Response(SaveSuggestionResponseSerializer(payload).data)
