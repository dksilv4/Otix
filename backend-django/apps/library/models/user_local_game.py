"""Per-user library of games detected on a desktop machine."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserLocalGame(TimestampedModel):
    """A game detected on the user's machine via the game scanner.

    Synced from the Electron app after each scan. Persists match state
    server-side so it survives client-side storage clears.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="local_games",
    )
    title = models.CharField(max_length=1000)
    platform = models.CharField(max_length=50)
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_local_games",
    )
    match_suggestion_media = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="local_game_match_suggestions",
    )
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_local_games"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "title", "platform"],
                name="uq_user_local_game",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title} ({self.platform})"
