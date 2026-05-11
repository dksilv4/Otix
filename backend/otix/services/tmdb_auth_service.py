from __future__ import annotations

import json
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

TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_AUTH_BASE = "https://www.themoviedb.org/authenticate"
REQUEST_TOKEN_TTL = 600


def _rt_key(request_token: str) -> str:
    return f"tmdb_oauth:rt:{request_token}"


def _state_key(state: str) -> str:
    return f"tmdb_oauth:state:{state}"


async def build_tmdb_link_url() -> tuple[str, str]:
    return await build_tmdb_link_url_for_user(None, f"{settings.frontend_base_url.rstrip('/')}/?tmdb_connect=1")


async def build_tmdb_link_url_for_user(user_id: str | None, redirect_url: str) -> tuple[str, str]:
    state = secrets.token_urlsafe(32)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{TMDB_API_BASE}/authentication/token/new",
                params={"api_key": settings.tmdb_api_key},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as err:
        logger.exception("tmdb request token creation failed")
        raise HTTPException(status_code=502, detail="Unable to start TMDb linking. Please try again.") from err

    if not data.get("success"):
        raise HTTPException(status_code=502, detail="TMDb returned an error. Please try again.")

    request_token = data.get("request_token")
    if not request_token:
        raise HTTPException(status_code=502, detail="TMDb returned an invalid response. Please try again.")

    redis = await get_redis()
    payload = json.dumps({"request_token": request_token, "user_id": user_id})
    await redis.set(_state_key(state), payload, ex=REQUEST_TOKEN_TTL)
    await redis.set(_rt_key(request_token), payload, ex=REQUEST_TOKEN_TTL)

    callback_separator = "&" if "?" in redirect_url else "?"
    redirect_to = urllib.parse.quote(f"{redirect_url}{callback_separator}state={state}", safe="")
    auth_url = f"{TMDB_AUTH_BASE}/{request_token}?redirect_to={redirect_to}"

    return auth_url, state


async def _consume_request_token(state: str, request_token: str | None = None) -> tuple[str, str | None]:
    redis = await get_redis()
    stored_raw = None
    lookup_key = None

    # Try state lookup first (state is in the redirect URL)
    if state:
        state_raw = await redis.get(_state_key(state))
        if state_raw:
            stored_raw = state_raw
            lookup_key = _state_key(state)

    # Fall back to request_token lookup (if TMDb mangled the state param)
    if not stored_raw and request_token:
        rt_raw = await redis.get(_rt_key(request_token))
        if rt_raw:
            stored_raw = rt_raw
            lookup_key = _rt_key(request_token)

    if not stored_raw:
        raise HTTPException(status_code=400, detail="TMDb linking session expired. Please try again.")

    try:
        stored = json.loads(stored_raw)
        stored_token = stored.get("request_token")
        user_id = stored.get("user_id")
    except (TypeError, json.JSONDecodeError):
        stored_token = str(stored_raw)
        user_id = None

    if request_token is not None and str(stored_token) != str(request_token):
        raise HTTPException(status_code=400, detail="Invalid TMDb linking session. Please try again.")

    # Clean up both keys
    if lookup_key:
        await redis.delete(lookup_key)
    if stored_token:
        await redis.delete(_rt_key(stored_token))
    if state:
        await redis.delete(_state_key(state))

    return str(stored_token), user_id


async def _create_session(request_token: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{TMDB_API_BASE}/authentication/session/new",
                params={"api_key": settings.tmdb_api_key},
                json={"request_token": request_token},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as err:
        logger.exception("tmdb session creation failed")
        raise HTTPException(status_code=502, detail="Unable to verify with TMDb. Please try again.") from err

    if not data.get("success"):
        raise HTTPException(status_code=400, detail="TMDb authorization failed. Please try linking again.")

    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(status_code=502, detail="TMDb returned an invalid session. Please try again.")

    return str(session_id)


async def get_tmdb_account(session_id: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{TMDB_API_BASE}/account",
                params={"api_key": settings.tmdb_api_key, "session_id": session_id},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        logger.exception("tmdb account fetch failed")
        return None


async def link_tmdb_to_user(session: AsyncSession, user: User, state: str, request_token: str) -> None:
    stored_token, state_user_id = await _consume_request_token(state, request_token)
    if state_user_id is not None and state_user_id != user.id:
        raise HTTPException(status_code=400, detail="Invalid TMDb linking session. Please try again.")
    await _link_tmdb_token_to_user(session, user, stored_token)


async def link_tmdb_state_to_user(session: AsyncSession, state: str, request_token: str | None = None) -> None:
    stored_token, user_id = await _consume_request_token(state, request_token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid TMDb linking session. Please try again.")
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="TMDb linking user is no longer available.")
    await _link_tmdb_token_to_user(session, user, stored_token)


async def _link_tmdb_token_to_user(session: AsyncSession, user: User, request_token: str) -> None:
    if user.tmdb_session_id is not None:
        raise HTTPException(status_code=400, detail="TMDb account already linked")

    session_id = await _create_session(request_token)

    existing = await session.scalar(select(User).where(User.tmdb_session_id == session_id))
    if existing is not None and existing.id != user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This TMDb account is already linked to another Otix account.")

    account = await get_tmdb_account(session_id)
    if not account:
        raise HTTPException(status_code=502, detail="Unable to fetch TMDb account details. Please try again.")

    account_id = account.get("id")
    if not account_id:
        raise HTTPException(status_code=502, detail="TMDb returned an invalid account profile. Please try again.")

    existing_account = await session.scalar(select(User).where(User.tmdb_account_id == int(account_id)))
    if existing_account is not None and existing_account.id != user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This TMDb account is already linked to another Otix account.")

    user.tmdb_session_id = session_id
    user.tmdb_account_id = int(account_id)
    user.tmdb_username = account.get("username") or account.get("name")
    avatar_data = account.get("avatar")
    if isinstance(avatar_data, dict):
        gravatar = avatar_data.get("gravatar")
        if isinstance(gravatar, dict):
            user.tmdb_avatar_hash = gravatar.get("hash")
    await session.flush()
    logger.info("tmdb account linked", user_id=user.id, tmdb_account_id=account_id)


async def unlink_tmdb_from_user(session: AsyncSession, user: User) -> None:
    if user.tmdb_session_id is None:
        raise HTTPException(status_code=400, detail="No TMDb account linked")
    account_id = user.tmdb_account_id
    user.tmdb_session_id = None
    user.tmdb_account_id = None
    user.tmdb_username = None
    user.tmdb_avatar_hash = None
    await session.flush()
    logger.info("tmdb account unlinked", user_id=user.id, tmdb_account_id=account_id)
