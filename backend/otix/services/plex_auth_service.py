from __future__ import annotations

import secrets
import urllib.parse

import httpx
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

PLEX_TV_BASE = "https://plex.tv"
PLEX_AUTH_URL = "https://app.plex.tv/auth"
PIN_TTL = 900


def _state_key(state: str) -> str:
    return f"plex_oauth:state:{state}"


def _plex_headers() -> dict[str, str]:
    return {
        "Accept": "application/json",
        "X-Plex-Client-Identifier": settings.plex_client_identifier,
        "X-Plex-Product": settings.plex_product,
        "X-Plex-Version": settings.plex_version,
    }


def _build_auth_url(code: str, state: str) -> str:
    callback = f"{settings.frontend_base_url}/auth/plex/connect/callback"
    forward_url = f"{callback}?{urllib.parse.urlencode({'state': state})}"
    params = {
        "clientID": settings.plex_client_identifier,
        "code": code,
        "forwardUrl": forward_url,
        "context[device][product]": settings.plex_product,
        "context[device][version]": settings.plex_version,
    }
    return f"{PLEX_AUTH_URL}#?{urllib.parse.urlencode(params)}"


async def build_plex_link_url() -> tuple[str, str, str]:
    """Create a Plex PIN and return (auth_url, state, pin_id)."""
    state = secrets.token_urlsafe(32)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{PLEX_TV_BASE}/api/v2/pins",
                params={"strong": "true"},
                headers=_plex_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as err:
        logger.exception("plex pin creation failed")
        raise HTTPException(status_code=502, detail="Unable to start Plex linking. Please try again.") from err

    pin_id = str(data.get("id") or "")
    code = str(data.get("code") or "")
    if not pin_id or not code:
        logger.warning("plex pin response missing id or code", response=data)
        raise HTTPException(status_code=502, detail="Plex returned an invalid linking response. Please try again.")

    redis = await get_redis()
    await redis.set(_state_key(state), pin_id, ex=PIN_TTL)
    return _build_auth_url(code, state), state, pin_id


async def _consume_state(state: str, pin_id: str | None = None) -> str:
    redis = await get_redis()
    key = _state_key(state)
    stored_pin_id = await redis.get(key)
    if not stored_pin_id:
        raise HTTPException(status_code=400, detail="Plex linking session expired. Please try again.")
    if pin_id and str(stored_pin_id) != str(pin_id):
        raise HTTPException(status_code=400, detail="Invalid Plex linking session. Please try again.")
    await redis.delete(key)
    return str(stored_pin_id)


async def _get_pin_auth_token(pin_id: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{PLEX_TV_BASE}/api/v2/pins/{pin_id}",
                headers=_plex_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as err:
        logger.exception("plex pin lookup failed", pin_id=pin_id)
        raise HTTPException(status_code=502, detail="Unable to verify with Plex. Please try again.") from err

    token = data.get("authToken") or data.get("auth_token")
    if not token:
        raise HTTPException(status_code=400, detail="Plex has not approved this link yet. Please finish signing in.")
    return str(token)


async def get_plex_user_info(token: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{PLEX_TV_BASE}/api/v2/user",
                headers={**_plex_headers(), "X-Plex-Token": token},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        logger.exception("plex user info request failed")
        return None


async def link_plex_to_user(session: AsyncSession, user: User, state: str, pin_id: str | None = None) -> None:
    if user.plex_id is not None:
        raise HTTPException(status_code=400, detail="Plex account already linked")

    resolved_pin_id = await _consume_state(state, pin_id)
    token = await _get_pin_auth_token(resolved_pin_id)
    profile = await get_plex_user_info(token)
    if not profile:
        raise HTTPException(status_code=502, detail="Unable to fetch Plex account details. Please try again.")

    plex_id = str(profile.get("id") or profile.get("uuid") or "")
    if not plex_id:
        raise HTTPException(status_code=502, detail="Plex returned an invalid account profile. Please try again.")

    existing = await session.scalar(select(User).where(User.plex_id == plex_id))
    if existing is not None and existing.id != user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This Plex account is already linked to another Otix account.")

    user.plex_id = plex_id
    user.plex_username = profile.get("username") or profile.get("title")
    user.plex_email = profile.get("email")
    user.plex_thumb = profile.get("thumb")
    user.plex_auth_token = token
    await session.flush()
    logger.info("plex account linked", user_id=user.id, plex_id=plex_id)


async def unlink_plex_from_user(session: AsyncSession, user: User) -> None:
    if user.plex_id is None:
        raise HTTPException(status_code=400, detail="No Plex account linked")
    plex_id = user.plex_id
    user.plex_id = None
    user.plex_username = None
    user.plex_email = None
    user.plex_thumb = None
    user.plex_auth_token = None
    await session.flush()
    logger.info("plex account unlinked", user_id=user.id, plex_id=plex_id)
