"""In-app notifications delivered to a user's feed.

Ported from the legacy ``notification.py`` domain module. Unlike the other
social tables the legacy ``notifications`` table was NOT a ``TimestampMixin``
row: it carries only a ``created_at`` (server default), so this model extends
``BaseModel`` and declares ``created_at`` itself (no ``updated_at``). The
Realtime fan-out lives in ``apps.social.signals`` /
``apps.social.services.realtime`` (publish to ``user:{id}:notifications``).
"""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class Notification(BaseModel):
    """A single pushable/in-app notification row for a user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    body = models.TextField(null=True, blank=True, default=None)
    metadata_json = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True, default=None)
    dedupe_key = models.CharField(max_length=255, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True, editable=False)

    class Meta(BaseModel.Meta):
        db_table = "notifications"
        indexes = [
            models.Index(fields=["user", "is_read"], name="ix_notifications_user_unread"),
            models.Index(fields=["user", "created_at"], name="ix_notifications_user_created"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.type}:{self.title}"
