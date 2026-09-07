"""Web-push subscription domain logic as plain callables.

Mirrors the legacy ``PushService`` (``backend/otix/services/push_service.py``)
subscribe/unsubscribe semantics: subscribing always inserts a row (the legacy
table has no unique constraint on ``(user, endpoint)``), and unsubscribing
deletes every row for the ``(user, endpoint)`` pair -- a no-op when none exist.
"""

from apps.push.models import PushSubscription


def subscribe(user_id: int, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
    """Register a new push subscription for the user; always inserts a row."""
    return PushSubscription.objects.create(
        user_id=user_id,
        endpoint=endpoint,
        p256dh_key=p256dh,
        auth_key=auth,
    )


def unsubscribe(user_id: int, endpoint: str) -> None:
    """Remove the user's subscriptions for ``endpoint``; a no-op when none exist."""
    PushSubscription.objects.filter(user_id=user_id, endpoint=endpoint).delete()
