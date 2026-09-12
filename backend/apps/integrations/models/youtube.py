"""Raw YouTube liked videos captured during a user's music sync."""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class UserYoutubeLikedVideo(BaseModel):
    """A raw YouTube liked video for a user.

    Stores every video from the liked-music sync verbatim so late matching
    against the catalog (``matched_media_item``) is repeatable.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="youtube_liked_videos"
    )
    video_id = models.CharField(max_length=50)
    title = models.TextField(default="")
    channel_id = models.CharField(max_length=50, default="")
    channel_title = models.TextField(default="")
    description = models.TextField(default="")
    thumbnail_url = models.TextField(null=True, blank=True)
    published_at = models.CharField(max_length=50, default="")
    matched_media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="youtube_liked_videos",
    )
    matched_title = models.TextField(null=True, blank=True)
    matched_artist = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "user_youtube_liked_videos"
        constraints = [
            models.UniqueConstraint(fields=["user", "video_id"], name="uq_user_youtube_video"),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.video_id})"
