"""Per-user recorded gameplay sessions."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserGameSession(TimestampedModel):
    """A recorded gameplay session for a user.

    Persists gameplay time, frame rate and hardware metrics, and catalog link
    server-side so telemetry and activity history survive client clears.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_sessions",
        db_index=True,
    )
    session_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    game_id = models.CharField(max_length=255, db_index=True)
    game_title = models.CharField(max_length=1000)
    process_name = models.CharField(max_length=255, null=True, blank=True)
    platform = models.CharField(max_length=50, default="pc")

    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_sessions",
    )

    start_time = models.DateTimeField(db_index=True)
    end_time = models.DateTimeField(null=True, blank=True, db_index=True)
    duration_seconds = models.PositiveIntegerField(default=0)

    # Performance & FPS telemetry
    avg_fps = models.FloatField(null=True, blank=True)
    min_fps = models.FloatField(null=True, blank=True)
    max_fps = models.FloatField(null=True, blank=True)
    low_1_percent = models.FloatField(null=True, blank=True)
    low_01_percent = models.FloatField(null=True, blank=True)
    total_frames = models.BigIntegerField(null=True, blank=True)
    fps_stats = models.JSONField(default=dict, blank=True)

    # Machine / Node info
    node_name = models.CharField(max_length=255, null=True, blank=True)
    node_info = models.JSONField(default=dict, blank=True)
    hardware = models.JSONField(default=dict, blank=True)

    # Artwork and slug cache
    poster_url = models.CharField(max_length=2048, null=True, blank=True)
    backdrop_url = models.CharField(max_length=2048, null=True, blank=True)
    banner_url = models.CharField(max_length=2048, null=True, blank=True)
    slug = models.CharField(max_length=255, null=True, blank=True)

    # Privacy: default True (Private)
    is_private = models.BooleanField(default=True, db_index=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_game_sessions"
        ordering = ["-start_time"]
        indexes = [
            models.Index(fields=["user", "-start_time"], name="idx_ugs_user_start_time"),
            models.Index(fields=["user", "game_id"], name="idx_ugs_user_game"),
            models.Index(fields=["user", "is_private"], name="idx_ugs_user_private"),
        ]

    def __str__(self) -> str:
        return f"{self.user.username}:{self.game_title} ({self.start_time.isoformat() if self.start_time else 'unknown'})"
