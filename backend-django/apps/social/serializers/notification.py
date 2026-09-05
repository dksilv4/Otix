"""Notification output shape (social domain).

Mirrors the legacy ``NotificationOut`` fields from
``backend/otix/schemas/notification.py``. The list response envelope
(``items``/``has_more``/``next_cursor``) is assembled by the view around this
per-row serializer.
"""

from rest_framework import serializers

from apps.social.models import Notification


class NotificationOutSerializer(serializers.ModelSerializer):
    """One notification row (legacy ``NotificationOut``)."""

    class Meta:
        model = Notification
        fields = (
            "id",
            "type",
            "title",
            "body",
            "metadata_json",
            "is_read",
            "created_at",
        )
        read_only_fields = fields
