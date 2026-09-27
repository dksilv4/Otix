"""Web-push subscription domain logic as plain callables.

Mirrors the legacy ``PushService`` subscribe/unsubscribe semantics, with an
upsert so re-enabling the same browser endpoint does not accumulate rows.
"""

from apps.push.models import PushSubscription


def subscribe(user_id: int, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
    """Register or refresh a push subscription for the user/endpoint pair."""
    existing = list(
        PushSubscription.objects.filter(user_id=user_id, endpoint=endpoint).order_by("id")
    )
    if existing:
        primary, *dupes = existing
        if dupes:
            PushSubscription.objects.filter(pk__in=[d.pk for d in dupes]).delete()
        primary.p256dh_key = p256dh
        primary.auth_key = auth
        primary.save(update_fields=["p256dh_key", "auth_key"])
        return primary
    return PushSubscription.objects.create(
        user_id=user_id,
        endpoint=endpoint,
        p256dh_key=p256dh,
        auth_key=auth,
    )


def unsubscribe(user_id: int, endpoint: str) -> None:
    """Remove the user's subscriptions for ``endpoint``; a no-op when none exist."""
    PushSubscription.objects.filter(user_id=user_id, endpoint=endpoint).delete()
