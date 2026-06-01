from __future__ import annotations

import asyncio
import json
import time
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.auth import (
    GoogleCallbackRequest,
    GoogleInitiateResponse,
)
from otix.domain.user import User
from otix.infrastructure.redis import get_redis

auth_router = APIRouter()

logger = structlog.get_logger()


@auth_router.post("/integrations/google", response_model=GoogleInitiateResponse)
async def google_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start Google account linking. Returns authorization URL."""
    from otix.services.google_auth_service import build_google_link_url

    url, state = await build_google_link_url()
    return {"auth_url": url, "state": state}


@auth_router.post("/integrations/google/callback")
async def google_connect_callback(
    body: GoogleCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Complete Google account linking with the authorization code."""
    from otix.services.google_auth_service import link_google_to_user

    try:
        await link_google_to_user(db, current_user, body.code, body.state)
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("google linking failed", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Failed to link Google account. Please try again.") from err

    await db.commit()
    return {"message": "Google account linked successfully"}


@auth_router.delete("/integrations/google")
async def google_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from otix.services.google_auth_service import unlink_google_from_user

    await unlink_google_from_user(db, current_user)
    await db.commit()
    return {"message": "Google account unlinked successfully"}


@auth_router.post("/integrations/youtube/sync", status_code=status.HTTP_202_ACCEPTED)
async def youtube_sync_watch_history(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a YouTube watch history sync. Returns a task_id for SSE streaming."""
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


@auth_router.get("/integrations/youtube/sync/{task_id}/stream")
async def youtube_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams YouTube sync progress events via Redis pub/sub."""
    from otix.lib.youtube_progress import get_latest_progress, get_stored_result

    channel = f"youtube:sync:{task_id}:events"

    stored = await get_stored_result(task_id)
    if stored is not None:
        stored["type"] = "sync_complete"
        payload = json.dumps(stored)

        async def replay():
            yield f"data: {payload}\n\n"

        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    latest = await get_latest_progress(task_id)

    async def event_generator():
        if latest is not None:
            yield f"data: {json.dumps(latest)}\n\n"

        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0

                event = json.loads(data)
                if event.get("type") in ("sync_complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
