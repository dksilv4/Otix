# TODO: Review this file
from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.auth import PlexDiscoveryResponse, PlexLibraryResponse, PlexServerResponse
from otix.services.plex_sync_service import discover_plex_libraries, discover_plex_servers

logger = structlog.get_logger()
router = APIRouter()


@router.get("/integrations/plex/servers", response_model=PlexDiscoveryResponse)
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
        status_code = e.response.status_code if e.response else 0
        logger.warning(
            "plex discover http error",
            user_id=current_user.id,
            url=failed_url,
            status=status_code,
            body=e.response.text[:500] if e.response else "",
        )
        if status_code == 401:
            from otix.services.plex_auth_service import unlink_plex_quietly

            await unlink_plex_quietly(db, current_user)
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Plex account was disconnected because access was revoked externally. "
                "Please re-link your account.",
            ) from e
        raise HTTPException(
            status_code=502,
            detail=f"Plex returned {status_code} for {failed_url}. The server may be unreachable or the connection may need to be refreshed.",
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
