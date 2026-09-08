"""Interaction, claim and episode-watched endpoints.

Port of the legacy ``interaction/router.py`` and the four
``episode_interaction/*`` routers. Writes that create a row reference the media
item hub / show, so missing targets 404 before any FK write.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media import services
from apps.media.serializers.social import (
    INTERACTION_TOGGLE_KEYS,
    BulkMarkResponseSerializer,
    EpisodeInteractionsOutSerializer,
    EpisodeToggleResponseSerializer,
    InteractionCreateBodySerializer,
    InteractionToggleResponseSerializer,
)
from apps.media.services import assets as assets_service

_VALID_TOGGLE_TYPES = set(INTERACTION_TOGGLE_KEYS)


def _toggle_type_error() -> ValidationError:
    return ValidationError(
        f"Invalid interaction type. Must be one of: {', '.join(sorted(_VALID_TOGGLE_TYPES))}"
    )


def _media_or_404(media_id: int):
    item = services.media_item_or_none(media_id)
    if item is None:
        raise NotFound("Media item not found")
    return item


def _show_or_404(show_id: int):
    show = services.get_show(show_id)
    if show is None:
        raise NotFound("Show not found")
    return show


class InteractionView(APIView):
    """``GET`` + ``PUT``/``DELETE /media/{media_type}/{media_id}/interactions[...]``."""

    def get(self, request, media_type: str, media_id: int) -> Response:
        return Response(services.user_interaction_state(request.user.id, media_id))

    def put(self, request, media_type: str, media_id: int, interaction_type: str) -> Response:
        if interaction_type not in _VALID_TOGGLE_TYPES:
            raise _toggle_type_error()
        _media_or_404(media_id)
        body = InteractionCreateBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        interaction = services.set_interaction(
            request.user,
            media_id,
            interaction_type,
            extra_data=body.validated_data.get("extra_data"),
        )
        counts = services.interaction_counts(media_id)
        payload = InteractionToggleResponseSerializer(
            {"interaction": interaction, "counts": counts}
        ).data
        return Response(payload)

    def delete(self, request, media_type: str, media_id: int, interaction_type: str) -> Response:
        if interaction_type not in _VALID_TOGGLE_TYPES:
            raise _toggle_type_error()
        if not services.remove_interaction(request.user, media_id, interaction_type):
            raise NotFound("Interaction not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClaimView(APIView):
    """``POST``/``DELETE /media/{media_id}/claim`` — own a local game."""

    def post(self, request, media_id: int) -> Response:
        if services.media_item_or_none(media_id) is None:
            return Response(
                {
                    "detail": f"Media item '{media_id}' not found. "
                    "Try re-scanning or syncing library first."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        services.set_interaction(request.user, media_id, "owned")
        assets_service.mirror_local_game_artwork(media_id)
        return Response({"status": "claimed"}, status=status.HTTP_201_CREATED)

    def delete(self, request, media_id: int) -> Response:
        services.remove_interaction(request.user, media_id, "owned")
        return Response(status=status.HTTP_204_NO_CONTENT)


class EpisodeInteractionsView(APIView):
    """``GET /media/{media_type}/{media_id}/episode-interactions``."""

    def get(self, request, media_type: str, media_id: int) -> Response:
        _show_or_404(media_id)
        state = services.episode_interactions(request.user.id, media_id)
        episodes = {
            str(ep_id): {
                "episode_id": int(ep_id),
                "watched": data["watched"],
                "watched_at": data["watched_at"],
            }
            for ep_id, data in state.items()
        }
        return Response(EpisodeInteractionsOutSerializer({"episodes": episodes}).data)


class EpisodeWatchedView(APIView):
    """``PUT``/``DELETE /media/{media_type}/{media_id}/episodes/{episode_id}/watched``."""

    def _resolve(self, show_id: int, episode_id: int):
        _show_or_404(show_id)
        try:
            return services.validate_episode_in_show(episode_id, show_id)
        except ValueError as exc:
            if "not found" in str(exc):
                raise NotFound(str(exc)) from None
            raise ValidationError(str(exc)) from None

    def put(self, request, media_type: str, media_id: int, episode_id: int) -> Response:
        episode = self._resolve(media_id, episode_id)
        services.set_episode_watched(request.user, episode.id)
        progress = services.show_progress(request.user.id, media_id)
        payload = EpisodeToggleResponseSerializer(
            {
                "interaction": {"episode_id": episode.id, "watched": True, "watched_at": None},
                "show_progress": progress,
            }
        ).data
        return Response(payload)

    def delete(self, request, media_type: str, media_id: int, episode_id: int) -> Response:
        episode = self._resolve(media_id, episode_id)
        if not services.remove_episode_watched(request.user, episode.id):
            raise NotFound("Episode interaction not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SeasonWatchedView(APIView):
    """``PUT``/``DELETE /media/{media_type}/{media_id}/seasons/{season_number}/watched``."""

    def _season_or_404(self, show_id: int, season_number: int):
        _show_or_404(show_id)
        season = services.get_season(show_id, season_number)
        if season is None:
            raise NotFound("Season not found")
        return season

    def put(self, request, media_type: str, media_id: int, season_number: int) -> Response:
        season = self._season_or_404(media_id, season_number)
        count = services.set_season_watched(request.user, season.id)
        return Response(BulkMarkResponseSerializer({"episodes_marked": count}).data)

    def delete(self, request, media_type: str, media_id: int, season_number: int) -> Response:
        season = self._season_or_404(media_id, season_number)
        count = services.remove_season_watched(request.user, season.id)
        return Response(BulkMarkResponseSerializer({"episodes_marked": count}).data)


class ShowWatchedView(APIView):
    """``PUT``/``DELETE /media/{media_type}/{media_id}/show-watched``."""

    def put(self, request, media_type: str, media_id: int) -> Response:
        _show_or_404(media_id)
        count = services.set_show_watched(request.user, media_id)
        return Response(BulkMarkResponseSerializer({"episodes_marked": count}).data)

    def delete(self, request, media_type: str, media_id: int) -> Response:
        _show_or_404(media_id)
        count = services.remove_show_watched(request.user, media_id)
        return Response(BulkMarkResponseSerializer({"episodes_marked": count}).data)
