"""Game save-path serializers (legacy ``saves.py`` location handlers).

``GET /saves/locations/{media_item_id}`` mirrors the legacy
``GameSaveLocationsResponse``: an official ``verified`` bucket and an
aggregated ``suggested`` bucket with per-pattern consensus counts. ``POST
.../suggest`` mirrors the legacy status/suggestion-count payload.
"""

from rest_framework import serializers


class SaveLocationSuggestionBodySerializer(serializers.Serializer):
    """Request body for suggesting a save location (``SaveLocationSuggestionRequest``)."""

    platform = serializers.CharField(max_length=50)
    path_pattern = serializers.CharField(max_length=2000)


class SaveLocationItemSerializer(serializers.Serializer):
    """An official/verified save-path row (``SaveLocationResponse``)."""

    platform = serializers.CharField()
    path_pattern = serializers.CharField()
    is_verified = serializers.BooleanField()


class SuggestedLocationItemSerializer(serializers.Serializer):
    """A user-suggestion bucket aggregated by platform+pattern (``count``)."""

    platform = serializers.CharField()
    path_pattern = serializers.CharField()
    count = serializers.IntegerField()


class GameSaveLocationsSerializer(serializers.Serializer):
    """Locations response for one game (``GameSaveLocationsResponse``)."""

    game_id = serializers.IntegerField()
    verified = SaveLocationItemSerializer(many=True)
    suggested = SuggestedLocationItemSerializer(many=True)


class SaveSuggestionResponseSerializer(serializers.Serializer):
    """Upsert + consensus result (``POST .../suggest``)."""

    status = serializers.CharField()
    suggestion_count = serializers.IntegerField()
    promoted_to_official = serializers.BooleanField()
