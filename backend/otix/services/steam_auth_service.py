from __future__ import annotations

import re
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

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
STEAM_API_BASE = "https://api.steampowered.com"
STEAM_ID_RE = re.compile(r"/id/(\d{17})$")
STATE_TTL = 600  # 10 minutes


def _state_key(state: str) -> str:
    return f"steam_oauth:state:{state}"


def _link_state_key(state: str) -> str:
    return f"steam_oauth:link_state:{state}"


def _return_to_with_state(return_to: str, state: str) -> str:
    parsed = urllib.parse.urlparse(return_to)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("state", state))
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query)))


def _flat_params(params: dict, raw_query: str | None = None) -> dict[str, str]:
    if raw_query:
        return {str(k): str(v) for k, v in urllib.parse.parse_qsl(raw_query, keep_blank_values=True)}
    return {str(k): str(v) for k, v in params.items()}


def _validation_body(params: dict, raw_query: str | None = None) -> str:
    if not raw_query:
        validate_params = _flat_params(params)
        validate_params["openid.mode"] = "check_authentication"
        validate_params.pop("state", None)
        return urllib.parse.urlencode(validate_params)

    pairs: list[str] = []
    found_mode = False
    for raw_pair in raw_query.split("&"):
        if not raw_pair:
            continue

        raw_key, _, raw_value = raw_pair.partition("=")
        key = urllib.parse.unquote_plus(raw_key)
        if key == "state":
            continue
        if key == "openid.mode":
            pairs.append(f"{raw_key}=check_authentication")
            found_mode = True
            continue
        pairs.append(f"{raw_key}={raw_value}" if "=" in raw_pair else raw_key)

    if not found_mode:
        pairs.append("openid.mode=check_authentication")
    return "&".join(pairs)


def _build_steam_url(return_to: str, state: str) -> str:
    return_to = _return_to_with_state(return_to, state)
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": settings.frontend_base_url,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID_URL}?{urllib.parse.urlencode(params)}"


async def _validate_openid_response(params: dict, raw_query: str | None = None) -> str:
    """Validate Steam OpenID response and return steam_id64.

    Raises HTTPException with a specific message on any validation failure.
    """
    flat = _flat_params(params, raw_query)

    if flat.get("openid.mode") != "id_res":
        raise HTTPException(
            status_code=400,
            detail="Invalid Steam response: missing or incorrect openid.mode",
        )

    validation_body = _validation_body(params, raw_query)

    logger.info(
        "steam validation request",
        signed=flat.get("openid.signed"),
        return_to=flat.get("openid.return_to", "")[:200],
        claimed_id=flat.get("openid.claimed_id", "")[:200],
        params_count=len(flat),
        raw_query=bool(raw_query),
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                STEAM_OPENID_URL,
                content=validation_body,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            text = resp.text
    except Exception as err:
        logger.exception("steam openid validation request failed")
        raise HTTPException(
            status_code=502,
            detail="Unable to verify with Steam. Please try again.",
        ) from err

    logger.info("steam validation response", response=text[:500])
    if "is_valid:true" not in text:
        logger.warning(
            "steam openid validation returned not valid",
            return_to=flat.get("openid.return_to", "")[:200],
        )
        raise HTTPException(
            status_code=400,
            detail="Steam rejected the authentication. Please try signing in again.",
        )

    claimed_id = flat.get("openid.claimed_id", "")
    match = STEAM_ID_RE.search(claimed_id)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Invalid Steam identity in callback. Please try again.",
        )

    return match.group(1)


async def build_steam_login_url() -> tuple[str, str]:
    """Build the Steam OpenID login URL and return (url, state)."""
    state = secrets.token_urlsafe(32)
    redis = await get_redis()
    await redis.set(_state_key(state), "1", ex=STATE_TTL)

    return_to = f"{settings.frontend_base_url}/auth/steam/callback"
    url = _build_steam_url(return_to, state)
    return url, state


async def build_steam_link_url() -> tuple[str, str]:
    """Build the Steam OpenID URL for account linking and return (url, state)."""
    state = secrets.token_urlsafe(32)
    redis = await get_redis()
    await redis.set(_link_state_key(state), "1", ex=STATE_TTL)

    return_to = f"{settings.frontend_base_url}/auth/steam/connect/callback"
    url = _build_steam_url(return_to, state)
    return url, state


async def validate_steam_callback(params: dict, raw_query: str | None = None) -> str:
    """Validate the Steam OpenID login callback and return the Steam ID64.

    Raises HTTPException on any validation failure.
    """
    flat = _flat_params(params, raw_query)
    state = flat.get("state")
    if not state:
        raise HTTPException(
            status_code=400,
            detail="Steam authentication session expired. Please try signing in again.",
        )

    state_key = _state_key(str(state))
    redis = await get_redis()
    if not await redis.get(state_key):
        logger.warning("steam oauth state not found or expired")
        raise HTTPException(
            status_code=400,
            detail="Steam authentication session expired. Please try signing in again.",
        )
    await redis.delete(state_key)

    return await _validate_openid_response(params, raw_query)


async def validate_steam_link_callback(params: dict, raw_query: str | None = None) -> str:
    """Validate the Steam OpenID link callback and return the Steam ID64.

    Raises HTTPException on any validation failure.
    """
    flat = _flat_params(params, raw_query)
    state = flat.get("state")
    if not state:
        raise HTTPException(
            status_code=400,
            detail="Steam authentication session expired. Please try signing in again.",
        )

    state_key = _link_state_key(str(state))
    redis = await get_redis()
    if not await redis.get(state_key):
        logger.warning("steam oauth state not found or expired")
        raise HTTPException(
            status_code=400,
            detail="Steam authentication session expired. Please try signing in again.",
        )
    await redis.delete(state_key)

    return await _validate_openid_response(params, raw_query)


async def get_steam_user_info(steam_id: str) -> dict | None:
    """Fetch the Steam player summary."""
    if not settings.steam_api_key:
        return None

    url = f"{STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={
                "key": settings.steam_api_key,
                "steamids": steam_id,
            })
            data = resp.json()
    except Exception:
        logger.exception("steam user info request failed")
        return None

    players = data.get("response", {}).get("players", [])
    if not players:
        return None
    return players[0]


async def find_or_create_steam_user(session: AsyncSession, steam_id: str) -> User:
    """Find an existing user by steam_id or create a new one."""
    user = await session.scalar(select(User).where(User.steam_id == steam_id))
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        return user

    # Fetch Steam profile info
    profile = await get_steam_user_info(steam_id)
    persona_name = profile.get("personaname", f"steam_user_{steam_id}") if profile else f"steam_user_{steam_id}"
    avatar_url = profile.get("avatarfull", None) if profile else None

    # Generate a unique username from the Steam persona name
    base_username = re.sub(r"[^a-zA-Z0-9_-]", "", persona_name)[:64]
    if not base_username:
        base_username = f"steam_{steam_id[:8]}"

    username = base_username
    suffix = 1
    while True:
        existing = await session.scalar(select(User).where(User.username == username))
        if existing is None:
            break
        username = f"{base_username}_{suffix}"
        suffix += 1

    from otix.services.auth_service import hash_password

    user = User(
        email=f"steam_{steam_id}@user.otix",
        username=username,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        steam_id=steam_id,
        is_verified=True,  # Steam accounts come pre-verified
        avatar_url=avatar_url,
    )
    session.add(user)
    await session.flush()
    logger.info("steam user created", user_id=user.id, steam_id=steam_id)
    return user


async def link_steam_to_user(session: AsyncSession, user: User, steam_id: str) -> None:
    """Link a Steam ID to an existing user. Raises HTTPException on conflict."""
    if user.steam_id == steam_id:
        return  # Already linked to this same account

    if user.steam_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your account is already linked to a different Steam account. Unlink it first.",
        )

    # Check if this steam_id is already linked to another user
    existing = await session.scalar(select(User).where(User.steam_id == steam_id))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Steam account is already linked to another Otix account.",
        )

    user.steam_id = steam_id
    await session.flush()
    logger.info("steam account linked", user_id=user.id, steam_id=steam_id)


async def unlink_steam_from_user(session: AsyncSession, user: User) -> None:
    """Remove the Steam link from a user."""
    if user.steam_id is None:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    steam_id = user.steam_id
    user.steam_id = None
    await session.flush()
    logger.info("steam account unlinked", user_id=user.id, steam_id=steam_id)
