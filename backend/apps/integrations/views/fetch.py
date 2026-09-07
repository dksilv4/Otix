"""Proxy-fetch client surface: device registration, SSE request stream, result.

Three authenticated endpoints under ``/api/v1/fetch/``:

* ``GET  /fetch/stream`` — persistent SSE on the caller's fetch-request channel
  (``fetch:{user_id}:requests:events``). A connected client keeps this open to
  receive ``fetch_request`` frames the dispatcher publishes. Connecting (and the
  other endpoints below) refreshes the client's ``last_seen`` heartbeat.
* ``POST /fetch/device`` — register/refresh a ``ClientDevice`` (stable client
  ``device_id`` upsert) carrying the user's per-provider keys + capabilities.
* ``POST /fetch/result`` — a device returns the raw payload it fetched for a
  parked (``awaiting_client``) job owned by the caller; the server seeds the
  catalog from it and completes the job.

The stream/device/result endpoints are all Bearer-authenticated (the desktop
companion holds the user's token). Browser EventSource cannot set headers, so a
browser client needs an extension/fetch relay — desktop is the first client.
"""

from __future__ import annotations

from typing import Any

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations.models import ClientDevice, SyncJob
from apps.integrations.services.fetch_proxy import AWAITING_CLIENT, fetch_request_channel
from apps.integrations.services.fetch_result import complete_from_client
from core import sse as sse_lib


def _touch_devices(user_id: int) -> None:
    """Refresh the last-seen heartbeat for a user's active devices."""
    ClientDevice.objects.filter(user_id=user_id, is_active=True).update(
        last_seen=timezone.now()
    )


class FetchRequestStreamView(APIView):
    """GET /api/v1/fetch/stream — persistent SSE of fetch_requests for this user."""

    def get(self, request: Request) -> StreamingHttpResponse:
        _touch_devices(request.user.pk)
        return sse_lib.sse_response(
            fetch_request_channel(request.user.pk),
            terminal_events=(),
            timeout=86400,
        )


class FetchDeviceView(APIView):
    """POST /api/v1/fetch/device — register or refresh a client device."""

    def post(self, request: Request) -> Response:
        data = request.data or {}
        device_id = data.get("device_id")
        if not isinstance(device_id, str) or not device_id.strip():
            return Response(
                {"detail": "device_id is required"}, status=400
            )
        device, _created = ClientDevice.objects.update_or_create(
            user=request.user,
            device_id=device_id.strip(),
            defaults={
                "kind": data.get("kind") or "desktop",
                "name": data.get("name") or "",
                "provider_keys": _dict_field(data, "provider_keys"),
                "capabilities": _dict_field(data, "capabilities"),
                "is_active": True,
            },
        )
        device.touch()
        return Response(
            {
                "device_id": device.device_id,
                "online": device.online,
                "last_seen": device.last_seen,
            },
            status=200,
        )


class FetchResultView(APIView):
    """POST /api/v1/fetch/result — seed a parked job from a client-fetched raw."""

    def post(self, request: Request) -> Response:
        data = request.data or {}
        task_id = data.get("task_id")
        provider = data.get("provider")
        entity_type = data.get("entity_type")
        raw = data.get("raw")

        try:
            job_pk = int(task_id)
        except (TypeError, ValueError):
            return Response({"detail": "task_id must be an integer"}, status=400)
        if not isinstance(provider, str) or not isinstance(entity_type, str):
            return Response(
                {"detail": "provider and entity_type are required"}, status=400
            )

        job = SyncJob.objects.filter(pk=job_pk, user=request.user).first()
        if job is None:
            return Response({"detail": "No matching fetch job"}, status=404)
        if job.status != AWAITING_CLIENT:
            return Response(
                {"detail": f"Fetch job is {job.status}, not awaiting a client"},
                status=409,
            )
        if job.provider != provider or job.entity_type != entity_type:
            return Response(
                {"detail": "provider/entity_type do not match the parked job"},
                status=400,
            )
        if not isinstance(raw, dict):
            return Response({"detail": "raw must be an object"}, status=400)

        outcome = complete_from_client(job, raw)
        if outcome.get("error"):
            return Response({"detail": outcome["error"]}, status=400)
        _touch_devices(request.user.pk)
        return Response(
            {
                "task_id": task_id,
                "status": "success",
                **{k: outcome[k] for k in ("media_id", "resolved_by") if k in outcome},
            },
            status=200,
        )


def _dict_field(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    return value if isinstance(value, dict) else {}
