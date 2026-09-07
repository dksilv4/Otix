"""Shared model base classes used by every domain app.

Greenfield models get an implicit BigAutoField primary key from the project's
``DEFAULT_AUTO_FIELD``. Keep this module tiny: extend it only when a behaviour
is genuinely shared by every domain model.
"""

from django.db import models


class BaseModel(models.Model):
    """Marker base for all Otix domain models.

    Intentionally small today (no PK override, no soft-delete). Future shared
    behaviour can be layered here without touching individual apps.
    """

    class Meta:
        abstract = True


class TimestampedModel(BaseModel):
    """Mixin adding auto-managed ``created_at`` / ``updated_at`` timestamps.

    ``updated_at`` refreshes on every save()/update(); ``created_at`` is set
    once at insert time.
    """

    created_at = models.DateTimeField(auto_now_add=True, editable=False, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, editable=False)

    class Meta:
        abstract = True
        ordering = ("-created_at",)
