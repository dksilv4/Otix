"""User-registered fetch-proxy client devices.

A ``ClientDevice`` represents a connected client (desktop companion, browser
extension) that has registered with the user's per-provider API keys and can
fetch provider raw payloads on the server's behalf. When the server lacks a
provider key but an online capable device holds one, the sync dispatcher parks
a ``SyncJob`` as ``awaiting_client`` and publishes a ``fetch_request`` to the
device's SSE channel instead of running the server-side httpx fetch.

Secrets note: provider keys are stored as plaintext JSON to match the existing
access-token storage convention in this app (``UserPlexServer.access_token``).
Encryption-at-rest is a deferred hardening item shared across those columns.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimestampedModel

# A device is "online" when its last heartbeat is within this window. SSE
# streams and explicit heartbeat POSTs refresh ``last_seen``.
ONLINE_TTL_SECONDS = 120


class ClientDevice(TimestampedModel):
    """A user-registered device able to fetch provider payloads with its keys.

    ``device_id`` is a stable client-generated id (one per install) so re-auth
    and re-registration upsert the same row instead of fanning out. Capabilities
    describe which provider mirrors the client ships (a desktop client that only
    mirrors TMDB should not be offered IGDB fetch requests).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="client_devices"
    )
    device_id = models.CharField(max_length=128)
    kind = models.CharField(
        max_length=20, default="desktop"
    )  # desktop | browser | extension
    name = models.CharField(max_length=200, blank=True, default="")
    provider_keys = models.JSONField(default=dict, blank=True)
    capabilities = models.JSONField(default=dict, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta(TimestampedModel.Meta):
        db_table = "client_devices"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "device_id"], name="uq_user_client_device"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name or self.device_id} ({self.user_id})"

    @property
    def online(self) -> bool:
        """True when last heartbeat is recent enough to accept a fetch request."""
        if self.last_seen is None:
            return False
        age = (timezone.now() - self.last_seen).total_seconds()
        return age <= ONLINE_TTL_SECONDS

    def touch(self) -> None:
        """Mark the device present now (heartbeat / SSE connect / result POST)."""
        self.last_seen = timezone.now()
        self.save(update_fields=("last_seen",))

    def has_provider_key(self, provider: str) -> bool:
        """True when this device holds a key the server may lack for *provider*."""
        return bool(self.provider_keys.get(provider))

    def can_fetch(self, provider: str) -> bool:
        """True when this device is able+keyed to fetch for *provider*."""
        caps = self.capabilities.get("providers") or []
        return (
            self.is_active
            and self.online
            and provider in caps
            and self.has_provider_key(provider)
        )
