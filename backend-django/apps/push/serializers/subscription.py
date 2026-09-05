"""Push request serializers.

Field names mirror the legacy FastAPI request bodies
(``backend/otix/api/push/router.py``) exactly: the wire format uses ``p256dh``
and ``auth`` for the subscription keys even though the model columns are named
``p256dh_key`` / ``auth_key``. The mapping happens in the view/service layer.
"""

from rest_framework import serializers


class SubscribeSerializer(serializers.Serializer):
    """Request body for ``POST /api/v1/push/subscribe``."""

    endpoint = serializers.CharField(max_length=512)
    p256dh = serializers.CharField(max_length=128)
    auth = serializers.CharField(max_length=64)


class UnsubscribeSerializer(serializers.Serializer):
    """Request body for ``DELETE /api/v1/push/subscribe``."""

    endpoint = serializers.CharField(max_length=512)
