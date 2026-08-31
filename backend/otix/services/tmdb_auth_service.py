# TODO: Review this file
from __future__ import annotations

import json
import re
import secrets
import urllib.parse

import httpx
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.ttl import TTL
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_AUTH_BASE = "https://www.themoviedb.org/authenticate"


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
    await redis.set(_state_key(state), payload, ex=TTL["AUTH"]["TMDB_REQUEST_TOKEN"])
    await redis.set(_rt_key(request_token), payload, ex=TTL["AUTH"]["TMDB_REQUEST_TOKEN"])

    callback_separator = "&" if "?" in redirect_url else "?"
    redirect_to = urllib.parse.quote(f"{redirect_url}{callback_separator}state={state}", safe="")
    auth_url = f"{TMDB_AUTH_BASE}/{request_token}?redirect_to={redirect_to}"

    return auth_url, state


async def build_tmdb_login_url() -> tuple[str, str]:
    """Build the TMDb authorization URL for login and return (url, state)."""
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
        raise HTTPException(status_code=502, detail="Unable to start TMDb login. Please try again.") from err

    if not data.get("success"):
        raise HTTPException(status_code=502, detail="TMDb returned an error. Please try again.")

    request_token = data.get("request_token")
    if not request_token:
        raise HTTPException(status_code=502, detail="TMDb returned an invalid response. Please try again.")

    redis = await get_redis()
    payload = json.dumps({"request_token": request_token, "flow": "login"})
    await redis.set(_state_key(state), payload, ex=TTL["AUTH"]["TMDB_REQUEST_TOKEN"])
    await redis.set(_rt_key(request_token), payload, ex=TTL["AUTH"]["TMDB_REQUEST_TOKEN"])

    callback_url = f"{settings.frontend_base_url}/auth/callback/tmdb-login"
    redirect_to = urllib.parse.quote(f"{callback_url}?state={state}", safe="")
    auth_url = f"{TMDB_AUTH_BASE}/{request_token}?redirect_to={redirect_to}"

    return auth_url, state


async def find_or_create_tmdb_user(
    session: AsyncSession,
    session_id: str,
    account_id: int,
    username: str = "",
) -> User:
    """Find an existing user by tmdb_account_id or create a new one."""
    user = await session.scalar(select(User).where(User.tmdb_account_id == account_id))
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        return user

    base_username = re.sub(r"[^a-zA-Z0-9_-]", "", username[:64]) if username else f"tmdb_{account_id}"
    if not base_username:
        base_username = f"tmdb_{account_id}"

    username_final = base_username
    suffix = 1
    while True:
        existing = await session.scalar(select(User).where(User.username == username_final))
        if existing is None:
            break
        username_final = f"{base_username}_{suffix}"
        suffix += 1

    from otix.services.auth.auth_service import hash_password

    user = User(
        email=f"tmdb_{account_id}@user.otix",
        username=username_final,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        tmdb_session_id=session_id,
        tmdb_account_id=account_id,
        tmdb_username=username or None,
        is_verified=True,
    )
    session.add(user)
    await session.flush()
    logger.info("tmdb user created", user_id=user.id, tmdb_account_id=account_id)
    return user


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


async def unlink_tmdb_quietly(session: AsyncSession, user: User) -> None:
    """Unlink TMDb from the user without raising on already-unlinked.

    Intended for auto-disconnect on external revocation.
    Sends a notification to the user about the disconnect.
    """
    if user.tmdb_session_id is None:
        return
    account_id = user.tmdb_account_id
    user.tmdb_session_id = None
    user.tmdb_account_id = None
    user.tmdb_username = None
    user.tmdb_avatar_hash = None
    try:
        await session.flush()
        from otix.services.notification_service import NotificationService

        nsvc = NotificationService(session)
        await nsvc.create(
            user_id=user.id,
            type_="integration_disconnected",
            title="TMDb disconnected",
            body="Your TMDb account was disconnected because access was revoked externally. "
            "Re-link your account in Settings to continue syncing.",
            metadata_json={"provider": "tmdb", "reason": "external_revocation"},
        )
        await session.commit()
        logger.info(
            "tmdb auto-disconnected due to external revocation",
            user_id=user.id,
            tmdb_account_id=account_id,
        )
    except Exception:
        await session.rollback()
        logger.exception(
            "tmdb auto-disconnect failed",
            user_id=user.id,
            tmdb_account_id=account_id,
        )
