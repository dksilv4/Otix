"""Server-wide key/value toggles for the media domain (self-hosted admin).

Currently holds the local-artwork mirroring flag. Read/written only through the
admin endpoints in ``apps.media.views.local_assets``; treat as an admin
preference store, not per-user data.
"""

from django.db import models

from core.models import BaseModel


class MediaServerSetting(BaseModel):
    """A single server-wide toggle keyed by a stable string."""

    key = models.CharField(max_length=64, unique=True)
    value = models.CharField(max_length=255, blank=True, default="")

    def __str__(self) -> str:
        return f"{self.key}={self.value}"
