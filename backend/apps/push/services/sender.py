"""Web-push delivery of a notification via ``pywebpush``.

For every ``PushSubscription`` a user has registered, sign + POST the
notification payload to its endpoint. Delivery is best-effort: an unset VAPID
private key or a missing ``pywebpush`` install is a benign no-op, a failed send
to one subscription never blocks the others, and an endpoint the push service
has retired (HTTP 404/410) is pruned so dead subscriptions don't accumulate.

``pywebpush`` is imported lazily so the absence of the optional dependency (e.g.
a worker image that predates its install) degrades to a no-op instead of failing
the import of every module that pulls in the release-notification task.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from apps.push.models import PushSubscription
from apps.push.services.vapid import get_vapid_private_key, get_vapid_subject

logger = logging.getLogger(__name__)

# Endpoints the push service has permanently retired — drop the subscription.
_EXPIRED_STATUS_CODES = {404, 410}


def _payload(notification: Any) -> str:
    return json.dumps(
        {
            "id": notification.pk,
            "type": notification.type,
            "title": notification.title,
            "body": notification.body,
            "metadata": notification.metadata_json,
        }
    )


def send_notification(notification: Any) -> int:
    """Push *notification* to every registered device of its user.

    Returns the number of subscriptions the push service accepted. A benign
    no-op (returning 0) when push is unconfigured or ``pywebpush`` is unavailable.
    """
    private_key = get_vapid_private_key()
    if not private_key:
        return 0
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush is not installed; skipping web-push delivery")
        return 0

    payload = _payload(notification)
    claims = {"sub": get_vapid_subject()}
    sent = 0
    subscriptions = PushSubscription.objects.filter(user_id=notification.user_id)
    for subscription in subscriptions:
        info = {
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh_key, "auth": subscription.auth_key},
        }
        try:
            webpush(
                subscription_info=info,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=claims,
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in _EXPIRED_STATUS_CODES:
                subscription.delete()
            else:
                logger.warning("web push failed for subscription %s: %s", subscription.pk, exc)
        except Exception:
            logger.exception("unexpected web push error for subscription %s", subscription.pk)
    return sent
