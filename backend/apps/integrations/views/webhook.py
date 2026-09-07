"""Inbound provider webhooks.

``POST /integrations/plex/webhook`` is Plex's outbound notification webhook: it
is unauthenticated, so its authenticity rests entirely on the HMAC-SHA256
``X-Plex-Signature`` over the raw request body signed with
``PLEX_WEBHOOK_SECRET``. We verify + acknowledge; actually rescanning the
user's Plex libraries in response awaits the Celery/sync machinery (task #6),
at which point this handler dispatches it.
"""

import hashlib
import hmac
import json

from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

WEBHOOK_NOT_CONFIGURED = "Webhook not configured"
MISSING_SIGNATURE = "Missing signature"
INVALID_SIGNATURE = "Invalid signature"


class PlexWebhookView(APIView):
    """POST /integrations/plex/webhook"""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        secret = getattr(settings, "PLEX_WEBHOOK_SECRET", "")
        if not secret:
            return Response({"detail": WEBHOOK_NOT_CONFIGURED}, status=403)

        signature = request.headers.get("X-Plex-Signature", "")
        if not signature:
            return Response({"detail": MISSING_SIGNATURE}, status=401)

        raw_body = request.body
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(f"sha256={expected}", signature):
            return Response({"detail": INVALID_SIGNATURE}, status=401)

        payload = None
        content_type = request.headers.get("content-type", "")
        try:
            if "multipart/form-data" in content_type:
                raw_payload = request.POST.get("payload")
                if isinstance(raw_payload, str):
                    payload = json.loads(raw_payload)
            elif "application/json" in content_type:
                payload = json.loads(raw_body.decode("utf-8", "replace"))
        except Exception:
            payload = None

        return Response(
            {
                "status": "accepted",
                "event": payload.get("event") if isinstance(payload, dict) else None,
            }
        )
