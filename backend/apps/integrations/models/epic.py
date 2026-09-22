"""Per-user Epic owned games from library scans."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserEpicGame(TimestampedModel):
    """An Epic game owned by the user, captured from a library sync."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="epic_games"
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="epic_games",
    )
    app_name = models.CharField(max_length=128)
    namespace = models.CharField(max_length=128, null=True, blank=True)
    catalog_item_id = models.CharField(max_length=128, null=True, blank=True)
    offer_id = models.CharField(max_length=128, null=True, blank=True)
    title = models.CharField(max_length=500)

    class Meta(TimestampedModel.Meta):
        db_table = "user_epic_games"
        constraints = [
            models.UniqueConstraint(fields=["user", "app_name"], name="uq_user_epic_game"),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.app_name})"
