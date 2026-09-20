"""Account-level SABnzbd / *arr connection settings shared across Otix nodes."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


def _empty_object() -> dict:
    return {}


class UserNodeConnection(TimestampedModel):
    """Downloader, arr, folder, and organize settings for the Otix backend node.

    Worker Otix nodes keep their own copy on disk. Account OAuth (Steam, Plex,
    TMDb, YouTube) stays on the user row.
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

    class Meta(TimestampedModel.Meta):
        db_table = "user_node_connections"

    def __str__(self) -> str:
        return f"node-connections:{self.user_id}"
