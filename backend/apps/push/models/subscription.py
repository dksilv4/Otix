"""Web-push subscription for one user/device."""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class PushSubscription(BaseModel):
    """A browser/device web-push subscription.

    ``endpoint`` plus the ``p256dh``/``auth`` keys are the full ECDH material
    a push service needs to deliver a message to this subscriber.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.CharField(max_length=512)
    p256dh_key = models.CharField(max_length=128)
    auth_key = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "push_subscriptions"

    def __str__(self) -> str:
        return f"{self.user_id}:{self.endpoint}"
