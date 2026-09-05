"""Per-user Plex servers, libraries and scanned items."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserPlexServer(TimestampedModel):
    """A Plex server the user has connected and may sync from."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="plex_servers"
    )
    machine_identifier = models.CharField(max_length=128)
    name = models.CharField(max_length=500)
    product = models.CharField(max_length=100, null=True, blank=True)
    platform = models.CharField(max_length=100, null=True, blank=True)
    base_url = models.CharField(max_length=2048, null=True, blank=True)
    fallback_url = models.CharField(max_length=2048, null=True, blank=True)
    access_token = models.TextField(null=True, blank=True)
    owned = models.BooleanField(default=False)
    selected = models.BooleanField(default=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_plex_servers"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "machine_identifier"], name="uq_user_plex_server"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.user_id})"


class UserPlexLibrary(TimestampedModel):
    """A library (section) on one of the user's Plex servers."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="plex_libraries"
    )
    server = models.ForeignKey(
        UserPlexServer, on_delete=models.CASCADE, related_name="libraries"
    )
    section_key = models.CharField(max_length=64)
    title = models.CharField(max_length=500)
    library_type = models.CharField(max_length=20)
    selected = models.BooleanField(default=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_plex_libraries"
        constraints = [
            models.UniqueConstraint(
                fields=["server", "section_key"], name="uq_user_plex_library"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.library_type})"


class UserPlexItem(TimestampedModel):
    """A scanned media item (movie/show/etc) in a user's Plex library.

    ``guids``/``raw`` keep the full provider payload so late matching against
    the catalog (``media_item``) can happen without a re-sync.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="plex_items"
    )
    server = models.ForeignKey(UserPlexServer, on_delete=models.CASCADE, related_name="items")
    library = models.ForeignKey(
        UserPlexLibrary, on_delete=models.SET_NULL, null=True, blank=True, related_name="items"
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plex_items",
    )
    rating_key = models.CharField(max_length=128)
    guid = models.CharField(max_length=512, null=True, blank=True)
    media_type = models.CharField(max_length=20)
    title = models.CharField(max_length=1000)
    year = models.IntegerField(null=True, blank=True)
    thumb_url = models.CharField(max_length=2048, null=True, blank=True)
    viewed = models.BooleanField(default=False)
    view_count = models.IntegerField(default=0)
    view_offset = models.IntegerField(null=True, blank=True)
    duration = models.IntegerField(null=True, blank=True)
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    guids = models.JSONField(default=list, null=True, blank=True)
    raw = models.JSONField(default=dict, null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_plex_items"
        constraints = [
            models.UniqueConstraint(
                fields=["server", "rating_key"], name="uq_user_plex_item"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.rating_key})"
