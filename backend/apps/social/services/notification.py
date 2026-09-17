"""Notification feed domain logic.

Port of the legacy ``NotificationService``
(``old-backend/otix/services/notification_service.py``) minus its Redis push
delivery. The list endpoint uses the same cursor shape: newest first, filtered
to rows older than an ISO ``created_at`` cursor, with a ``limit + 1`` probe to
compute ``has_more``.
"""

from django.utils import timezone

from apps.social.models import Notification


def list_notifications(user_id: int, limit: int = 20, cursor=None):
    """Return ``(items, has_more, next_cursor)`` for the user's feed."""
    queryset = Notification.objects.filter(user_id=user_id).order_by("-created_at", "-id")
    if cursor is not None:
        queryset = queryset.filter(created_at__lt=cursor)
    items = list(queryset[: limit + 1])
    has_more = len(items) > limit
    if has_more:
        items = items[:limit]
    next_cursor = items[-1].created_at.isoformat() if items and has_more else None
    return items, has_more, next_cursor


def get_unread_count(user_id: int) -> int:
    """Count notifications the user has not read yet."""
    return Notification.objects.filter(user_id=user_id, is_read=False).count()


def mark_notification_read(notification_id: int, user_id: int) -> Notification | None:
    """Mark one notification read; ``None`` when it is not the user's."""
    notification = (
        Notification.objects.filter(pk=notification_id, user_id=user_id).first()
    )
    if notification is None:
        return None
    notification.is_read = True
    notification.read_at = timezone.now()
    notification.save(update_fields=["is_read", "read_at"])
    return notification


def mark_all_read(user_id: int) -> None:
    """Mark every unread notification read in one UPDATE."""
    Notification.objects.filter(user_id=user_id, is_read=False).update(
        is_read=True, read_at=timezone.now()
    )
