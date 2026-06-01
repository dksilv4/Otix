from __future__ import annotations

import json
import time
import uuid

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.auth import (
    PlexCallbackRequest,
    PlexDiscoveryResponse,
    PlexInitiateResponse,
    PlexLibraryResponse,
    PlexServerResponse,
    PlexSessionResponse,
    PlexSessionsResponse,
    PlexSyncTaskResponse,
)
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.services.plex_auth_service import (
    build_plex_link_url,
    link_plex_to_user,
    unlink_plex_from_user,
)
from otix.services.plex_sync_service import (
    discover_plex_libraries,
    discover_plex_servers,
    get_plex_sessions,
)

auth_router = APIRouter()

logger = structlog.get_logger()


@auth_router.post("/integrations/plex", response_model=PlexInitiateResponse)
async def plex_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> PlexInitiateResponse:
    if current_user.plex_id is not None:
        raise HTTPException(status_code=400, detail="Plex account already linked")
    url, state, pin_id = await build_plex_link_url()
    return PlexInitiateResponse(auth_url=url, state=state, pin_id=pin_id)


@auth_router.post("/integrations/plex/callback")
async def plex_connect_callback(
    body: PlexCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await link_plex_to_user(db, current_user, body.state, body.pin_id)
    await db.commit()
    return {"message": "Plex account linked successfully"}


@auth_router.delete("/integrations/plex")
async def plex_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await unlink_plex_from_user(db, current_user)
    await db.commit()
    return {"message": "Plex account unlinked successfully"}


@auth_router.get("/integrations/plex/servers", response_model=PlexDiscoveryResponse)
async def plex_discover_servers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexDiscoveryResponse:
    try:
        servers = await discover_plex_servers(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except httpx.HTTPStatusError as e:
        failed_url = str(e.request.url) if e.request else "unknown"
        logger.warning(
            "plex discover http error",
            user_id=current_user.id,
            url=failed_url,
            status=e.response.status_code,
            body=e.response.text[:500] if e.response else "",
        )
        raise HTTPException(
            status_code=502,
            detail=f"Plex returned {e.response.status_code} for {failed_url}. The server may be unreachable or the connection may need to be refreshed.",
        ) from e
    except httpx.TimeoutException as e:
        failed_url = str(e.request.url) if e.request else "unknown"
        logger.warning("plex discover timeout", user_id=current_user.id, url=failed_url)
        raise HTTPException(
            status_code=504,
            detail=f"Connection to Plex timed out ({failed_url}). Check that your server is running and remote access is enabled.",
        ) from e
    except httpx.ConnectError as e:
        failed_url = str(e.request.url) if e.request else "unknown"
        logger.warning("plex discover connection error", user_id=current_user.id, url=failed_url)
        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to Plex at {failed_url}. Check that your server is running and remote access is enabled.",
        ) from e
    except Exception as e:
        logger.exception("plex discover failed", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Failed to discover Plex servers. Please try again later.") from e

    # Discover libraries per-server, skipping unreachable ones
    libraries = []
    unreachable_servers = []
    for server in servers:
        try:
            libraries.extend(await discover_plex_libraries(db, current_user, server))
        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPStatusError):
            logger.warning(
                "plex server unreachable during discovery, skipping",
                server_name=server.name,
                machine_id=server.machine_identifier,
            )
            unreachable_servers.append(server.name)
    await db.commit()

    return PlexDiscoveryResponse(
        servers=[PlexServerResponse.model_validate(server) for server in servers],
        libraries=[PlexLibraryResponse.model_validate(library) for library in libraries],
        unreachable_servers=unreachable_servers if unreachable_servers else None,
    )


@auth_router.post(
    "/integrations/plex/sync",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=PlexSyncTaskResponse,
)
async def plex_sync_now(
    current_user: User = Depends(get_current_user),
) -> PlexSyncTaskResponse:
    """Start a Plex sync task on the Celery fast queue. Returns a task_id for SSE streaming."""
    from otix.infrastructure.celery import app as celery_app

    task_id = str(uuid.uuid4())
    celery_app.send_task(
        "maintenance.plex_sync_user",
        args=[task_id, current_user.id],
    )
    logger.info("plex sync task enqueued", user_id=current_user.id, task_id=task_id)
    return PlexSyncTaskResponse(task_id=task_id)


@auth_router.get("/integrations/plex/sync/{task_id}/stream")
async def plex_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams Plex sync progress events via Redis pub/sub."""
    from otix.lib.plex_progress import get_stored_result

    channel = f"plex:sync:{task_id}:events"

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

    async def event_generator():
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


@auth_router.post("/integrations/plex/watchlist/sync")
async def plex_watchlist_sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.plex_id:
        raise HTTPException(status_code=400, detail="No Plex account linked")

    from otix.services.plex_sync_service import sync_plex_watchlist

    try:
        result = await sync_plex_watchlist(db, current_user)
        await db.commit()
    except Exception:
        logger.exception("plex watchlist sync failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to sync Plex watchlist. Please try again.")
    return result


@auth_router.post("/integrations/plex/webhook")
async def plex_webhook(request: Request) -> dict:
    payload = None
    content_type = request.headers.get("content-type", "")
    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            raw_payload = form.get("payload")
            if isinstance(raw_payload, str):
                payload = json.loads(raw_payload)
        elif "application/json" in content_type:
            payload = await request.json()
    except Exception:
        logger.exception("plex webhook payload parse failed")

    from otix.infrastructure.celery import app

    app.send_task("maintenance.sync_plex_accounts")
    return {
        "status": "accepted",
        "event": payload.get("event") if isinstance(payload, dict) else None,
    }


@auth_router.get("/integrations/plex/sessions", response_model=PlexSessionsResponse)
async def plex_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexSessionsResponse:
    if not current_user.plex_auth_token:
        raise HTTPException(status_code=400, detail="No Plex account linked")
    sessions = await get_plex_sessions(db, current_user)
    return PlexSessionsResponse(sessions=[PlexSessionResponse(**s) for s in sessions])


@auth_router.get("/integrations/plex/connect-info/{media_item_id}")
async def plex_connect_info(
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return Plex connection info for a media item, including all reachable base URLs."""
    from otix.domain.media import UserPlexItem, UserPlexServer
    from otix.services.plex_sync_service import _get_alternative_plex_urls

    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == current_user.id,
            UserPlexItem.media_item_id == media_item_id,
        )
    )
    if plex_item is None:
        raise HTTPException(status_code=404, detail="Media item not found in your Plex library")

    server = await db.get(UserPlexServer, plex_item.server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Plex server not found")

    alt_urls = await _get_alternative_plex_urls(server, current_user)
    base_urls = [server.base_url] if server.base_url else []
    for url in alt_urls:
        if url not in base_urls:
            base_urls.append(url)

    token = server.access_token or current_user.plex_auth_token

    album_thumb_url = None
    if base_urls and token and plex_item.rating_key:
        album_thumb_url = f"{base_urls[0]}/library/metadata/{plex_item.rating_key}/thumb?X-Plex-Token={token}"

    return {
        "base_url": base_urls[0] if base_urls else None,
        "base_urls": base_urls,
        "token": token,
        "rating_key": plex_item.rating_key,
        "album_thumb_url": album_thumb_url,
    }


@auth_router.get("/integrations/plex/album-tracks/{media_item_id}")
async def plex_album_tracks(
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return Plex album tracks and connection info for a media item."""
    from otix.domain.media import UserPlexItem, UserPlexServer
    from otix.services.plex_sync_service import (
        _get_alternative_plex_urls,
        get_plex_album_tracks,
    )

    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == current_user.id,
            UserPlexItem.media_item_id == media_item_id,
        )
    )
    if plex_item is None:
        raise HTTPException(status_code=404, detail="Media item not found in your Plex library")

    server = await db.get(UserPlexServer, plex_item.server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Plex server not found")

    alt_urls = await _get_alternative_plex_urls(server, current_user)
    base_urls = [server.base_url] if server.base_url else []
    for url in alt_urls:
        if url not in base_urls:
            base_urls.append(url)

    result = await get_plex_album_tracks(db, current_user, media_item_id)
    if result is None:
        raise HTTPException(status_code=502, detail="Could not fetch Plex album tracks")

    tracks, working_base_url = result
    effective_base_url = working_base_url or base_urls[0]
    token = server.access_token or current_user.plex_auth_token

    album_thumb_url = None
    if effective_base_url and token and plex_item.rating_key:
        album_thumb_url = f"{effective_base_url}/library/metadata/{plex_item.rating_key}/thumb?X-Plex-Token={token}"

    return {
        "tracks": tracks,
        "base_url": effective_base_url,
        "base_urls": base_urls,
        "token": token,
        "rating_key": plex_item.rating_key,
        "album_thumb_url": album_thumb_url,
    }


@auth_router.get("/integrations/plex/stream/{rating_key}")
async def plex_stream(
    rating_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RedirectResponse:
    """Redirect to a Plex stream URL for the given rating key.

    Pass ?base_url=... to skip server discovery and use a known-working URL.
    """
    from otix.domain.media import UserPlexServer
    from otix.services.plex_sync_service import _resolve_stream_url_for_server_with_base, get_plex_stream_url

    base_url_hint = request.query_params.get("base_url")

    if base_url_hint:
        # Fast path: use the provided base URL directly
        token = current_user.plex_auth_token
        # Also try server access tokens
        servers_result = await db.execute(select(UserPlexServer).where(UserPlexServer.user_id == current_user.id))
        for server in servers_result.scalars().all():
            if server.access_token:
                token = server.access_token
                break

        if token:
            url = await _resolve_stream_url_for_server_with_base(base_url_hint, token, rating_key)
            if url:
                return RedirectResponse(url, status_code=302)

    # Slow path: full server discovery
    url = await get_plex_stream_url(db, current_user, rating_key)
    if url is None:
        raise HTTPException(status_code=404, detail="Stream URL not available")

    return RedirectResponse(url, status_code=302)
