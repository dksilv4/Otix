from __future__ import annotations

import asyncio
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.deps import get_current_user
from otix.domain.user import User
from otix.lib.sse import SseStreamConfig, create_sse_response
from otix.lib.youtube_progress import get_latest_progress, get_stored_result

logger = structlog.get_logger()
router = APIRouter()


@router.post("/integrations/youtube/sync", status_code=status.HTTP_202_ACCEPTED)
async def youtube_sync_watch_history(
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.google_id is None:
        raise HTTPException(status_code=400, detail="No Google account linked")
    task_id = str(uuid.uuid4())
    logger.info("youtube sync task started", user_id=current_user.id, task_id=task_id)
    asyncio.create_task(_run_youtube_sync_background(task_id, current_user.id))
    return {"task_id": task_id}


async def _run_youtube_sync_background(task_id: str, user_id: str) -> None:
    from otix.infrastructure.database import async_session
    from otix.lib.youtube_progress import publish_progress, store_result
    from otix.services.youtube_sync_service import sync_youtube_watch_history

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.google_id is None:
                return
            await sync_youtube_watch_history(session, user, task_id=task_id)
            await session.commit()
    except Exception as e:
        logger.exception("youtube sync background task failed", user_id=user_id, task_id=task_id)
        msg = str(e)
        if hasattr(e, "message"):
            msg = e.message
        await publish_progress(task_id, "error", message=msg)
        await store_result(task_id, {"error": msg})


@router.get("/integrations/youtube/sync/{task_id}/stream")
async def youtube_sync_stream(
    task_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """SSE stream of YouTube sync progress events."""
    return await create_sse_response(
        SseStreamConfig(
            channel=f"youtube:sync:{task_id}:events",
            terminal_events=("sync_complete", "error"),
            result_replay=lambda: get_stored_result(task_id),
            progress_replay=lambda: get_latest_progress(task_id),
        ),
        request,
    )
