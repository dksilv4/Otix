"""Reusable SSE framework for Redis pub/sub event streams.

Usage
-----
::

    from otix.lib.sse import SseStreamConfig, create_sse_response

    # --- Persistent stream (notifications — never self-terminates)
    @router.get("/notifications/stream")
    async def notification_stream(request: Request, ...):
        return await create_sse_response(
            SseStreamConfig(channel=f"user:{user.id}:notifications"),
            request,
        )

    # --- Task stream (sync progress — self-terminates on terminal event)
    @router.get("/integrations/plex/sync/{task_id}/stream")
    async def plex_sync_stream(task_id: str, request: Request, ...):
        return await create_sse_response(
            SseStreamConfig(
                channel=f"plex:sync:{task_id}:events",
                terminal_events=("sync_complete", "error"),
                result_replay=lambda: get_stored_result(task_id),
            ),
            request,
        )
"""

from otix.lib.sse._config import SseStreamConfig
from otix.lib.sse._core import sse_headers
from otix.lib.sse._response import create_sse_response

__all__ = [
    "SseStreamConfig",
    "create_sse_response",
    "sse_headers",
]
