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
    SpotifyCallbackRequest,
    SpotifyInitiateResponse,
)
from otix.domain.user import User
from otix.infrastructure.redis import get_redis

auth_router = APIRouter()

logger = structlog.get_logger()


async def _spotify_stats(user: User) -> dict | None:
    if user.spotify_id is None:
        return None
    try:
        from otix.services.spotify_auth_service import get_spotify_user_profile, get_user_access_token

        token = await get_user_access_token(user)
        if not token:
            return None
        profile = await get_spotify_user_profile(token)
        if not profile:
            return None
        return {
            "followers": (profile.get("followers") or {}).get("total", 0),
            "product": profile.get("product"),
            "country": profile.get("country"),
        }
    except Exception:
        return None


@auth_router.post("/integrations/spotify", response_model=SpotifyInitiateResponse)
async def spotify_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start Spotify account linking. Returns authorization URL."""
    from otix.services.spotify_auth_service import build_spotify_link_url

    url, state = await build_spotify_link_url()
    return {"auth_url": url, "state": state}


@auth_router.post("/integrations/spotify/callback")
async def spotify_connect_callback(
    body: SpotifyCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Complete Spotify account linking with the authorization code."""
    from otix.services.spotify_auth_service import link_spotify_to_user

    try:
        await link_spotify_to_user(db, current_user, body.code, body.state)
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("spotify linking failed", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Failed to link Spotify account. Please try again.") from err

    await db.commit()
    return {"message": "Spotify account linked successfully"}


@auth_router.delete("/integrations/spotify")
async def spotify_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from otix.services.spotify_auth_service import unlink_spotify_from_user

    await unlink_spotify_from_user(db, current_user)
    await db.commit()
    return {"message": "Spotify account unlinked successfully"}


@auth_router.post("/integrations/spotify/sync", status_code=status.HTTP_202_ACCEPTED)
async def spotify_sync_library(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a Spotify library sync. Returns a task_id for SSE streaming."""
    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")

    task_id = str(uuid.uuid4())
    logger.info("spotify sync task started", user_id=current_user.id, task_id=task_id)

    # Run sync in-process via background asyncio task so it starts immediately
    # (Celery queues are backed up too far for user-initiated actions)
    asyncio.create_task(_run_spotify_sync_background(task_id, current_user.id))

    return {"task_id": task_id}


async def _run_spotify_sync_background(task_id: str, user_id: str) -> None:
    """Run the Spotify library sync in a background asyncio task within the API process."""
    from otix.infrastructure.database import async_session
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_library_service import sync_spotify_user_library

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.spotify_id is None:
                return

            token = await get_user_access_token(user)
            if token is None:
                logger.warning("spotify sync failed, no valid token", user_id=user_id)
                from otix.lib.spotify_progress import publish_progress, store_result

                await publish_progress(
                    task_id, "error", message="No valid Spotify token. Try reconnecting your account."
                )
                await store_result(task_id, {"error": "No valid token"})
                return

            await sync_spotify_user_library(session, user, token, task_id=task_id)
            await session.commit()
    except Exception:
        logger.exception("spotify sync background task failed", user_id=user_id, task_id=task_id)


@auth_router.get("/integrations/spotify/sync/{task_id}/stream")
async def spotify_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams Spotify sync progress events via Redis pub/sub.

    Replays the latest stored progress on reconnect so the user sees current
    state even after reloading the page.
    """
    from otix.lib.spotify_progress import get_latest_progress, get_stored_result

    channel = f"spotify:sync:{task_id}:events"

    # Check if the task already finished before the SSE subscriber connected
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

    # Replay the latest intermediate progress if available (reconnect case)
    latest = await get_latest_progress(task_id)

    async def event_generator():
        # Replay latest progress first so reconnecting clients see current phase
        if latest is not None:
            yield f"data: {json.dumps(latest)}\n\n"

        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0  # 5-minute idle timeout
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    # Send keep-alive comment so proxies don't close the connection
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


@auth_router.post("/integrations/spotify/recently-played/sync", status_code=status.HTTP_202_ACCEPTED)
async def spotify_sync_recently_played(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a Spotify recently played sync. Returns a task_id for SSE streaming."""
    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")

    task_id = str(uuid.uuid4())
    logger.info("spotify recently played sync task started", user_id=current_user.id, task_id=task_id)

    asyncio.create_task(_run_spotify_recently_played_background(task_id, current_user.id))

    return {"task_id": task_id}


async def _run_spotify_recently_played_background(task_id: str, user_id: str) -> None:
    """Run the Spotify recently played sync in a background asyncio task."""
    from otix.infrastructure.database import async_session
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_library_service import sync_spotify_recently_played

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.spotify_id is None:
                return

            token = await get_user_access_token(user)
            if token is None:
                logger.warning("spotify recently played sync failed, no valid token", user_id=user_id)
                from otix.lib.spotify_progress import publish_progress, store_result

                await publish_progress(
                    task_id, "error", message="No valid Spotify token. Try reconnecting your account."
                )
                await store_result(task_id, {"error": "No valid token"})
                return

            await sync_spotify_recently_played(session, user, token, task_id=task_id)
            await session.commit()
    except Exception:
        logger.exception("spotify recently played sync background task failed", user_id=user_id, task_id=task_id)


@auth_router.get("/integrations/spotify/recently-played/sync/{task_id}/stream")
async def spotify_recently_played_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams Spotify recently played sync progress events."""
    from otix.lib.spotify_progress import get_latest_progress, get_stored_result

    channel = f"spotify:sync:{task_id}:events"

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


@auth_router.get("/integrations/spotify/token")
async def spotify_get_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a valid Spotify access token for the Web Playback SDK."""
    from otix.services.spotify_auth_service import get_user_access_token

    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")

    if not current_user.spotify_refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Spotify session expired. Please reconnect your account in Settings.",
        )

    token = await get_user_access_token(current_user)
    if token is None:
        raise HTTPException(
            status_code=502,
            detail="Spotify token refresh failed. Please reconnect your account in Settings.",
        )

    await db.commit()
    return {"accessToken": token, "expiresIn": 3600}
