"""Per-user connected game server nodes (otix-server daemons)."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserGameServer(TimestampedModel):
    """A self-hosted game installer & cloud save server connected by the user.

    Stores local (LAN) and remote (WAN/Tailscale) endpoints, auth token,
    health status, and cached storage stats.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_servers",
    )
    name = models.CharField(max_length=255)
    local_url = models.CharField(max_length=2048, null=True, blank=True)
    remote_url = models.CharField(max_length=2048, null=True, blank=True)
    auth_token = models.CharField(max_length=512, null=True, blank=True)
    is_online = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    total_files = models.IntegerField(default=0)
    storage_free_bytes = models.BigIntegerField(default=0)
    storage_total_bytes = models.BigIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_game_servers"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name} ({self.local_url or self.remote_url})"

    @property
    def primary_url(self) -> str:
        return self.remote_url or self.local_url or ""
