from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, Request, status

from otix.api._utils import get_current_user
from otix.domain.user import User
from otix.lib.plex_progress import get_stored_result
from otix.lib.sse import SseStreamConfig, create_sse_response
from otix.schemas.auth import PlexSyncTaskResponse

logger = structlog.get_logger()
router = APIRouter()


@router.post("/integrations/plex/sync", status_code=status.HTTP_202_ACCEPTED, response_model=PlexSyncTaskResponse)
async def plex_sync_now(
    current_user: User = Depends(get_current_user),
) -> PlexSyncTaskResponse:
    from otix.infrastructure.celery import app as celery_app
    task_id = str(uuid.uuid4())
    celery_app.send_task(
        "maintenance.plex_sync_user",
        args=[task_id, current_user.id],
    )
    logger.info("plex sync task enqueued", user_id=current_user.id, task_id=task_id)
    return PlexSyncTaskResponse(task_id=task_id)


@router.get("/integrations/plex/sync/{task_id}/stream")
async def plex_sync_stream(
    task_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """SSE stream of Plex sync progress events."""
    return await create_sse_response(
        SseStreamConfig(
            channel=f"plex:sync:{task_id}:events",
            terminal_events=("sync_complete", "error"),
            result_replay=lambda: get_stored_result(task_id),
        ),
        request,
    )
