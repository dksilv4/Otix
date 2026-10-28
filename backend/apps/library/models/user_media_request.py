"""Persisted media requests queued through Otix."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserMediaRequest(TimestampedModel):
    """A media or download request sent from Otix to a node service."""

    STATUS_REQUESTED = "requested"
    STATUS_PROCESSING = "processing"
    STATUS_DOWNLOADING = "downloading"
    STATUS_AVAILABLE = "available"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_REQUESTED, "Requested"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_DOWNLOADING, "Downloading"),
        (STATUS_AVAILABLE, "Available"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media_requests",
    )
    server = models.ForeignKey(
        "library.UserNode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="media_requests",
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="media_requests",
    )
    media_type = models.CharField(max_length=32, default="movie")  # movie, show, game, usenet
    title = models.CharField(max_length=500)
    year = models.IntegerField(null=True, blank=True)
    tmdb_id = models.CharField(max_length=64, blank=True, default="")
    tvdb_id = models.CharField(max_length=64, blank=True, default="")
    poster_url = models.TextField(blank=True, default="")
    service = models.CharField(max_length=32, default="radarr")  # radarr, sonarr, usenet, sabnzbd
    instance_id = models.CharField(max_length=128, blank=True, default="")
    instance_name = models.CharField(max_length=255, blank=True, default="")
    quality_profile_name = models.CharField(max_length=128, blank=True, default="")
    root_folder_path = models.CharField(max_length=500, blank=True, default="")
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_REQUESTED,
        db_index=True,
    )
    progress = models.FloatField(default=0.0)
    search_now = models.BooleanField(default=True)
    monitored = models.BooleanField(default=True)
    external_id = models.CharField(max_length=128, blank=True, default="")
    error_message = models.TextField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_media_requests"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title} ({self.media_type} - {self.status})"


# Backward / semantic alias
MediaRequest = UserMediaRequest
