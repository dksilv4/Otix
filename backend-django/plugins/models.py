"""Plugin registry models — plugin *state* the Django API owns.

The host is a separate process that runs plugin *code*; the API owns the rows
that record operator intent: which plugin folders are registered, whether they
are enabled, what capabilities the operator has granted, and their
config/instances. The pure-Python core (``manifest`` / ``discovery`` /
``registry`` / ``base``) never imports this module, so plugin code and the host
keep importing ``plugins.*`` without pulling in Django model baggage.
"""

from django.db import models

from core.models import TimestampedModel
from plugins.permissions import missing_grants, unsupported_grants


class Plugin(TimestampedModel):
    """A registered drop-in plugin folder (``name`` == folder, a slug).

    Identity fields mirror the manifest; operator state (enabled/grants/config)
    is what the API persists and the host reacts to.
    """

    name = models.CharField(max_length=64, unique=True)
    version = models.CharField(max_length=32)
    description = models.TextField(blank=True, default="")
    author = models.CharField(max_length=255, blank=True, default="")
    repository = models.CharField(max_length=2000, blank=True, default="")
    icon = models.CharField(max_length=255, blank=True, default="")
    stage = models.CharField(max_length=16, default="stable")
    min_app_version = models.CharField(max_length=32, blank=True, default="")

    # Bundled host plugins: auto-enabled, never disabled or uninstalled.
    system = models.BooleanField(default=False)
    enabled = models.BooleanField(default=False, db_index=True)
    # Last error reported by a scan or the host; empty when healthy.
    error = models.TextField(blank=True, default="")

    # Snapshot of the validated manifest at (re)scan time — the API's describe().
    manifest = models.JSONField(default=dict, editable=False)
    # Security surface: permissions_declared comes from the manifest and is not
    # editable; permissions_granted is the operator-approved set. Enabling
    # requires declared ⊆ granted (scope wildcards table:any/network:any cover
    # any table:* / network:* token — see plugins.permissions).
    permissions_declared = models.JSONField(default=list, editable=False)
    permissions_granted = models.JSONField(default=list)
    # Operator config: flat key/value matching manifest.config field schema,
    # plus named server instances for services that need several (e.g. arrs).
    config = models.JSONField(default=dict)
    instances = models.JSONField(default=list)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return f"{self.name} {self.version}"

    def granted_set(self) -> set[str]:
        return set(self.permissions_granted or [])

    def missing_grants(self) -> list[str]:
        """Declared tokens not yet granted (scope wildcards honoured)."""
        return sorted(missing_grants(self.permissions_declared or [], self.granted_set()))

    def invalid_grants(self) -> list[str]:
        """Granted tokens the framework does not understand."""
        return sorted(unsupported_grants(self.granted_set()))
