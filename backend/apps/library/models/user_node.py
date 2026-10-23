"""Per-user connected Otix nodes (otix-node daemons)."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserNode(TimestampedModel):
    """A self-hosted Otix node connected by the user.

    Stores local (LAN) and remote (WAN/Tailscale) endpoints, auth token,
    health status, cached storage stats, and whether it's local.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_servers",
    )
    home = models.ForeignKey(
        "library.UserHome",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nodes",
    )
    name = models.CharField(max_length=255)
    local_url = models.CharField(max_length=2048, null=True, blank=True)
    remote_url = models.CharField(max_length=2048, null=True, blank=True)
    auth_token = models.CharField(max_length=512, null=True, blank=True)
    is_online = models.BooleanField(default=True)
    is_local = models.BooleanField(default=False)
    is_local_desktop = models.BooleanField(default=False, db_index=True)
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
        if self.is_local:
            return self.local_url or self.remote_url or ""
        return self.remote_url or self.local_url or ""

    @property
    def effective_home(self):
        """Return the directly assigned home or inherit from parent hosting server machine."""
        if self.home_id:
            return self.home
        parent = self.hosted_server_machines.filter(home__isnull=False).select_related("home").first()
        return parent.home if parent else None


# Backward compatibility alias
UserGameServer = UserNode
