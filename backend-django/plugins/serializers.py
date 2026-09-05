"""Input serializers for the plugin framework API routes."""

from __future__ import annotations

from rest_framework import serializers


class CallSerializer(serializers.Serializer):
    """Body for ``POST /plugins/<id>/call`` — a data-method dispatch."""

    method = serializers.CharField(max_length=200, allow_blank=False)
    payload = serializers.JSONField(required=False, allow_null=True)
