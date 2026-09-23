"""Account-level SABnzbd / *arr / Epic settings for the Django backend node."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


def _empty_object() -> dict:
    return {}


class UserNodeConnection(TimestampedModel):
    """Downloader, arr, folder, organize, and Epic settings for the Otix backend node.

    The Django backend *is* the product node. Account OAuth for Steam/Plex/TMDb/
    YouTube stays on the user row; Epic launcher tokens live here.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="node_connections",
    )
    usenet = models.JSONField(default=_empty_object, blank=True)
    radarr = models.JSONField(default=_empty_object, blank=True)
    sonarr = models.JSONField(default=_empty_object, blank=True)
    libraries = models.JSONField(default=list, blank=True)
    organize = models.JSONField(default=_empty_object, blank=True)
    epic = models.JSONField(default=_empty_object, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_node_connections"

    def __str__(self) -> str:
        return f"node-connections:{self.user_id}"
