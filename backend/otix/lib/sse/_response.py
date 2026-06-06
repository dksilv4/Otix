"""StreamingResponse factory for SSE event streams."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import StreamingResponse

from otix.lib.sse._config import SseStreamConfig
from otix.lib.sse._core import sse_event_generator, sse_headers


async def create_sse_response(
    config: SseStreamConfig,
    request: Request,
) -> StreamingResponse:
    """Build a ``StreamingResponse`` for the given event stream config.

    This is the primary entry point for all SSE endpoints.  Example::

        @router.get("/notifications/stream")
        async def notification_stream(
            request: Request,
            current_user: User = Depends(get_current_user),
        ):
            return await create_sse_response(
                SseStreamConfig(channel=f"user:{current_user.id}:notifications"),
                request,
            )
    """
    generator = sse_event_generator(
        channel=config.channel,
        terminal_events=config.terminal_events,
        timeout=config.timeout,
        result_replay=config.result_replay,
        progress_replay=config.progress_replay,
        request=request,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers=sse_headers(),
    )
