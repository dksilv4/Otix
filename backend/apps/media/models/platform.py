"""Platforms/game-modes (game availability vocabulary) plus media links."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from apps.media.models.media_item import MediaItem
from core.models import BaseModel


class Platform(BaseModel):
    """A hardware/platform a game ships on (PC, PlayStation 5, Switch, ...)."""

    name = models.CharField(max_length=100)
    slug = models.CharField(max_length=100, unique=True)
    logo_image_id = models.CharField(max_length=100, null=True, blank=True)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="platform",
    )

    class Meta(BaseModel.Meta):
        db_table = "platforms"

    def __str__(self) -> str:
        return self.name


class MediaPlatform(BaseModel):
    """Link: a media item (game) is available on a platform."""

    media_item = models.ForeignKey(MediaItem, on_delete=models.CASCADE, related_name="platforms")
    platform = models.ForeignKey(Platform, on_delete=models.CASCADE, related_name="media_platforms")

    class Meta(BaseModel.Meta):
        db_table = "media_platforms"
        constraints = [
            models.UniqueConstraint(
                fields=["media_item", "platform"], name="uq_media_platform"
            )
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.platform_id}"


class GameMode(BaseModel):
    """A single-player/multiplayer mode descriptor (single, co-op, ...)."""

    name = models.CharField(max_length=100)
    slug = models.CharField(max_length=100, unique=True)

    class Meta(BaseModel.Meta):
        db_table = "game_modes"

    def __str__(self) -> str:
        return self.name


class MediaGameMode(BaseModel):
    """Link: a media item (game) supports a game mode."""

    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="game_modes"
    )
    game_mode = models.ForeignKey(
        GameMode, on_delete=models.CASCADE, related_name="media_game_modes"
    )

    class Meta(BaseModel.Meta):
        db_table = "media_game_modes"
        constraints = [
            models.UniqueConstraint(
                fields=["media_item", "game_mode"], name="uq_media_game_mode"
            )
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.game_mode_id}"
