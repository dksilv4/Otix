"""Provider background-sync endpoints: enqueue (POST) + SSE progress (GET).

``POST /plex/sync`` and ``POST /youtube/sync`` create a ``SyncJob`` row and
answer 202 with its ``task_id`` (the pk doubles as the SSE ``task_id``), then
hand the row to ``run_sync_job`` (``.delay``) whose eager/real worker runs the
registered ``plex``/``youtube`` engine (each POST also accepts a ``library_id``
for a single-library plex scan). ``GET /{provider}/sync/{task_id}/stream`` opens
a Redis pub/sub SSE stream on ``{provider}:sync:{task_id}:events`` that
self-terminates on a ``sync_complete``/``error`` frame, replaying a stored
result/progress first.
"""

from __future__ import annotations

from django.http import StreamingHttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.integrations import services as integrations_services
from apps.integrations.tasks import run_sync_job
from core import sse as sse_lib


class PlexSyncView(APIView):
    """POST /integrations/plex/sync — enqueue a Plex library/user sync."""

    def post(self, request) -> Response:
        library_id = (request.data or {}).get("library_id")
        job = integrations_services.enqueue_sync_job(
            provider="plex",
            entity_type="library" if library_id else "user",
            external_id=library_id or str(request.user.id),
        )
        run_sync_job.delay(job.pk)
        return Response({"task_id": str(job.pk)}, status=202)


class PlexSyncStreamView(APIView):
    """GET /integrations/plex/sync/{task_id}/stream — SSE progress events."""

    def get(self, request, task_id: str) -> StreamingHttpResponse:
        return sse_lib.sse_response(
            f"plex:sync:{task_id}:events",
            terminal_events=("sync_complete", "error"),
            result_replay=lambda: sse_lib.read_json_key(f"plex:sync:{task_id}:result"),
            progress_replay=lambda: sse_lib.read_json_key(
                f"plex:sync:{task_id}:progress"
            ),
        )


class YoutubeSyncView(APIView):
    """POST /integrations/youtube/sync — enqueue + dispatch a watch-history sync."""

    def post(self, request) -> Response:
        if not request.user.google_id:
            return Response({"detail": "No Google account linked"}, status=400)
        job = integrations_services.enqueue_sync_job(
            provider="youtube",
            entity_type="watch-history",
            external_id=str(request.user.id),
        )
        run_sync_job.delay(job.pk)
        return Response({"task_id": str(job.pk)}, status=202)


class YoutubeSyncStreamView(APIView):
    """GET /integrations/youtube/sync/{task_id}/stream — SSE progress events."""

    def get(self, request, task_id: str) -> StreamingHttpResponse:
        return sse_lib.sse_response(
            f"youtube:sync:{task_id}:events",
            terminal_events=("sync_complete", "error"),
            result_replay=lambda: sse_lib.read_json_key(f"youtube:sync:{task_id}:result"),
            progress_replay=lambda: sse_lib.read_json_key(
                f"youtube:sync:{task_id}:progress"
            ),
        )
