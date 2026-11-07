"""Serializers for GameEdition model."""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.media.models.game_edition import GameEdition


class GameEditionOutSerializer(serializers.Serializer):
    """High-performance public read serializer for GameEdition."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    raw_title = serializers.CharField()
    igdb_id = serializers.CharField(allow_null=True)
    release_date = serializers.DateField(allow_null=True)
    external_ids = serializers.JSONField(default=dict)
    cover_image_id = serializers.CharField(allow_null=True)
    summary = serializers.CharField(allow_null=True)
    is_default = serializers.BooleanField(default=False)

    def to_representation(self, instance: GameEdition | dict[str, Any]) -> dict[str, Any]:
        if isinstance(instance, dict):
            return instance
        return {
            "id": instance.id,
            "name": instance.name,
            "raw_title": instance.raw_title,
            "igdb_id": instance.igdb_id,
            "release_date": instance.release_date.isoformat() if instance.release_date else None,
            "external_ids": instance.external_ids or {},
            "cover_image_id": instance.cover_image_id,
            "summary": instance.summary,
            "is_default": bool(instance.is_default),
        }
