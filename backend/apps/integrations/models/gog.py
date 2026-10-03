"""Per-user GOG owned games from library scans."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserGOGGame(TimestampedModel):
    """A GOG game owned by the user, captured from a library sync."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="gog_games"
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="gog_games",
    )
    game_id = models.CharField(max_length=128)
    title = models.CharField(max_length=500)
    slug = models.CharField(max_length=256, null=True, blank=True)
    image = models.CharField(max_length=500, null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_gog_games"
        constraints = [
            models.UniqueConstraint(fields=["user", "game_id"], name="uq_user_gog_game"),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.game_id})"
