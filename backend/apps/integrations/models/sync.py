"""Provider sync jobs and per-provider sync cursor state."""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class SyncJob(BaseModel):
    """A queued/running/finished sync job for an external provider entity.

    ``parent`` links child jobs (e.g. per-library or per-item refreshes) back
    to the top-level job that spawned them. ``user`` stays null for
    server-driven bulk/catalog jobs; the proxy-fetch dispatcher sets it to the
    owner of the client device a job is parked on (``awaiting_client``).
    """

    provider = models.CharField(max_length=20)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sync_jobs",
    )
    entity_type = models.CharField(max_length=20)
    external_id = models.CharField(max_length=100)
    status = models.CharField(max_length=20, default="pending")
    priority = models.IntegerField(default=5)
    phase = models.CharField(max_length=20, default="core")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    error_message = models.TextField(null=True, blank=True)
    retry_count = models.IntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "sync_jobs"

    def __str__(self) -> str:
        return f"{self.provider}:{self.entity_type}:{self.external_id} ({self.status})"


class ProviderState(BaseModel):
    """Sync cursor/rate-limit state for one external provider.

    Legacy keyed on ``provider`` as its natural primary key; the Django model
    keeps the string unique rather than an integer surrogate id.
    """

    provider = models.CharField(max_length=20, unique=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    cursor_value = models.CharField(max_length=500, null=True, blank=True)
    rate_limit_remaining = models.IntegerField(null=True, blank=True)
    rate_limit_reset = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "provider_state"

    def __str__(self) -> str:
        return f"{self.provider}"
