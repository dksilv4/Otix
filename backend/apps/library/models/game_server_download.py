"""Persisted download jobs queued through a connected game server."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class GameServerDownload(TimestampedModel):
    """A Usenet/torrent job Otix sent to a game server, plus later SAB history."""

    STATUS_QUEUED = "queued"
    STATUS_DOWNLOADING = "downloading"
    STATUS_PAUSED = "paused"
    STATUS_PROCESSING = "processing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_server_downloads",
    )
    server = models.ForeignKey(
        "library.UserGameServer",
        on_delete=models.CASCADE,
        related_name="downloads",
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_server_downloads",
    )
    nzo_id = models.CharField(max_length=128)
    title = models.CharField(max_length=1000)
    protocol = models.CharField(max_length=20, default="usenet")
    status = models.CharField(max_length=32, default=STATUS_QUEUED, db_index=True)
    percentage = models.FloatField(default=0)
    size_bytes = models.BigIntegerField(default=0)
    error_message = models.TextField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "game_server_downloads"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=("server", "nzo_id"), name="uq_game_server_download_nzo"),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"
