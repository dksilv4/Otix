"""Saved-game upload/matching path patterns per game and platform."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class GameSavePathSuggestion(TimestampedModel):
    """Per-user suggested save-path pattern for a game on a platform.

    A path the user has confirmed for a game; used to locate saves during
    upload/matching.
    """

    game = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.CASCADE,
        related_name="save_path_suggestions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_save_path_suggestions",
    )
    platform = models.CharField(max_length=50)
    path_pattern = models.CharField(max_length=2000)

    class Meta(TimestampedModel.Meta):
        db_table = "game_save_path_suggestions"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "game", "platform"],
                name="uq_user_game_platform_suggestion",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.game_id} ({self.platform})"


class GameSaveOfficialPath(TimestampedModel):
    """Known official save-path pattern for a game on a platform.

    Community-verified/default path shipped to clients when no user
    suggestion exists yet.
    """

    game = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.CASCADE,
        related_name="save_official_paths",
    )
    platform = models.CharField(max_length=50)
    path_pattern = models.CharField(max_length=2000)
    is_verified = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        db_table = "game_save_official_paths"
        constraints = [
            models.UniqueConstraint(
                fields=["game", "platform"],
                name="uq_game_platform_official_path",
            )
        ]

    def __str__(self) -> str:
        return f"{self.game_id} ({self.platform}): {self.path_pattern}"
