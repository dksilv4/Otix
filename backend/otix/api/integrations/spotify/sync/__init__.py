"""Spotify library sync endpoint.

Initiates a background sync of the user's liked tracks and saved albums
from Spotify into Otix, with SSE progress streaming via Redis pub/sub.

*POST /integrations/spotify/sync*  — starts a sync, returns task_id (202)
*GET /integrations/spotify/sync/{task_id}/stream* — SSE progress stream
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.deps import get_current_user
from otix.api.integrations.spotify import (
    SpotifySyncResponse,
    acquire_sync_lock,
    generate_task_id,
    release_sync_lock,
    verify_spotify_linked,
)
from otix.domain.user import User
from otix.infrastructure.database import async_session
from otix.lib.spotify_progress import get_latest_progress, get_stored_result
from otix.lib.sse import SseStreamConfig, create_sse_response
from otix.services.spotify_auth_service import get_user_access_token
from otix.services.spotify_library_service import sync_spotify_user_library

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/integrations/spotify/sync",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=SpotifySyncResponse,
)
async def spotify_sync_library(
    current_user: User = Depends(get_current_user),
) -> SpotifySyncResponse:
    """Start a full library sync (liked tracks + saved albums)."""
    await verify_spotify_linked(current_user)

    if not await acquire_sync_lock(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A Spotify sync is already in progress for your account",
        )

    task_id = generate_task_id()
    logger.info(
        "spotify sync task started", user_id=current_user.id, task_id=task_id
    )
    # TODO: Replace asyncio.create_task with a Celery task so the sync
    # survives worker restarts and can be tracked/ managed centrally.
    asyncio.create_task(_run_spotify_sync_background(task_id, current_user.id))
    return SpotifySyncResponse(task_id=task_id)


async def _run_spotify_sync_background(task_id: str, user_id: str) -> None:
    # TODO: Replace with Celery task — see POST handler
    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.spotify_id is None:
                return

            token = await get_user_access_token(user, session=session)
            if token is None:
                logger.warning(
                    "spotify sync failed, no valid token", user_id=user_id
                )
                from otix.lib.spotify_progress import publish_progress, store_result

                await publish_progress(
                    task_id,
                    "error",
                    message="No valid Spotify token. Try reconnecting your account.",
                )
                await store_result(task_id, {"error": "No valid token"})
                return

            await sync_spotify_user_library(session, user, token, task_id=task_id)
            await session.commit()
    except Exception:
        logger.exception(
            "spotify sync background task failed", user_id=user_id, task_id=task_id
        )
    finally:
        await release_sync_lock(user_id)


@router.get("/integrations/spotify/sync/{task_id}/stream")
async def spotify_sync_stream(
    task_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """SSE stream of sync progress events."""
    return await create_sse_response(
        SseStreamConfig(
            channel=f"spotify:sync:{task_id}:events",
            terminal_events=("sync_complete", "error"),
            result_replay=lambda: get_stored_result(task_id),
            progress_replay=lambda: get_latest_progress(task_id),
        ),
        request,
    )
