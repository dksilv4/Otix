"""Per-user connected Otix nodes (otix-node daemons)."""

import uuid
from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserNode(TimestampedModel):
    """A self-hosted Otix node connected by the user.

    Stores local (LAN), remote (Tailscale/WAN), and classified network interfaces,
    API key, persistent machine UUID, telemetry stats, and health status.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nodes",
    )
    home = models.ForeignKey(
        "library.UserHome",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nodes",
    )
    machine_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True,
        help_text="Immutable hardware/daemon UUID identifier",
    )
    name = models.CharField(max_length=255)
    primary_url = models.CharField(max_length=2048, blank=True, default="")
    local_url = models.CharField(max_length=2048, null=True, blank=True)
    remote_url = models.CharField(max_length=2048, null=True, blank=True)
    local_ip = models.CharField(max_length=255, blank=True, default="")
    port = models.IntegerField(default=7777)
    api_key = models.CharField(max_length=512, blank=True, default="", db_index=True)
    is_online = models.BooleanField(default=True, db_index=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True, db_index=True)
    network_interfaces = models.JSONField(
        default=list,
        blank=True,
        help_text="List of classified interfaces: [{'type': 'lan'|'tailscale'|'loopback'|'docker', 'ip': '...', 'url': '...', 'priority': int}]",
    )
    system_stats = models.JSONField(
        default=dict,
        blank=True,
        help_text="Telemetry metrics: cpu_percent, memory_used_bytes, memory_total_bytes, disk stats",
    )
    version = models.CharField(max_length=64, blank=True, default="")

    # Telemetry and state fields
    is_local = models.BooleanField(default=False)
    is_local_desktop = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True)
    total_files = models.IntegerField(default=0)
    storage_free_bytes = models.BigIntegerField(default=0)
    storage_total_bytes = models.BigIntegerField(default=0)

    class Meta(TimestampedModel.Meta):
        db_table = "user_nodes"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        endpoint = self.primary_url or self.local_url or self.remote_url or f"{self.local_ip}:{self.port}"
        return f"{self.user_id}:{self.name} ({endpoint})"

    def save(self, *args, **kwargs):
        if not self.primary_url:
            if self.is_local:
                self.primary_url = (
                    self.local_url
                    or (f"http://{self.local_ip}:{self.port}" if self.local_ip else "")
                    or self.remote_url
                    or ""
                )
            else:
                self.primary_url = (
                    self.remote_url
                    or self.local_url
                    or (f"http://{self.local_ip}:{self.port}" if self.local_ip else "")
                    or ""
                )
        super().save(*args, **kwargs)

    @property
    def auth_token(self) -> str:
        """Backward compatibility property for api_key."""
        return self.api_key

    @auth_token.setter
    def auth_token(self, value: str) -> None:
        self.api_key = value or ""

    @property
    def last_seen_at(self):
        """Backward compatibility property for last_heartbeat."""
        return self.last_heartbeat

    @last_seen_at.setter
    def last_seen_at(self, value):
        self.last_heartbeat = value

    @property
    def effective_home(self):
        """Return the directly assigned home or inherit from parent hosting machine."""
        if self.home_id:
            return self.home
        parent = (
            self.hosted_machines.filter(home__isnull=False).select_related("home").first()
        )
        return parent.home if parent else None

    @property
    def hosted_server_machines(self):
        return self.hosted_machines
