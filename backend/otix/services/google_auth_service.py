# TODO: Review this file
"""Google OAuth2 service: authorization-code grant, token refresh, link/unlink.

Uses OpenID Connect. Docs: https://developers.google.com/identity/protocols/oauth2
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select

from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
STATE_TTL = 600  # 10 minutes

# Google forbids requesting Drive and YouTube scopes together in a single
# OAuth consent request, so each flow requests only the scopes it needs.
# Sign-in and the YouTube link flow grant the youtube scope (signing in with
# Google historically granted YouTube sync); Drive is a separate consent.
YOUTUBE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube"]
DRIVE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"]


class TokenRevokedError(Exception):
    """Raised when the OAuth provider indicates the user has revoked access.

    Callers that have a DB session available should auto-unlink the
    integration via ``get_user_google_access_token(user, session=session)``.
    """


def _state_key(state: str) -> str:
    return f"google_oauth:state:{state}"


def _build_callback_url() -> str:
    return f"{settings.frontend_base_url}/auth/callback/google"


def _build_drive_callback_url() -> str:
    return f"{settings.frontend_base_url}/auth/callback/google-drive"


def _generate_pkce() -> tuple[str, str]:
    """Generate a PKCE code_verifier and its S256 code_challenge."""
    code_verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


async def _build_authorization_url(
    *,
    scopes: list[str],
    callback: str,
    state: str,
    verifier: str,
    challenge: str,
) -> str:
    params = {
        "client_id": settings.google_client_id,
        "response_type": "code",
        "redirect_uri": callback,
        "state": state,
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


async def build_google_link_url(user_id: str | None = None) -> tuple[str, str]:
    """Build the Google OAuth2 authorization URL for the YouTube link flow.

    Returns (url, state). If *user_id* is provided it is stored alongside
    the state in Redis so the callback can resolve the user without a JWT
    (Electron openExternal).
    """
    state = secrets.token_urlsafe(32)
    verifier, challenge = _generate_pkce()
    redis = await get_redis()
    payload = {"v": "1", "flow": "youtube", "verifier": verifier}
    if user_id:
        payload["user_id"] = user_id
    await redis.set(_state_key(state), json.dumps(payload), ex=STATE_TTL)

    url = await _build_authorization_url(
        scopes=YOUTUBE_SCOPES,
        callback=_build_callback_url(),
        state=state,
        verifier=verifier,
        challenge=challenge,
    )
    return url, state


async def build_google_drive_link_url(user_id: str | None = None) -> tuple[str, str]:
    """Build the Google OAuth2 authorization URL for the Drive link flow.

    Requests only the drive.file scope — Google forbids requesting Drive and
    YouTube scopes in the same consent request.
    """
    state = secrets.token_urlsafe(32)
    verifier, challenge = _generate_pkce()
    redis = await get_redis()
    payload = {"v": "1", "flow": "drive", "verifier": verifier}
    if user_id:
        payload["user_id"] = user_id
    await redis.set(_state_key(state), json.dumps(payload), ex=STATE_TTL)

    url = await _build_authorization_url(
        scopes=DRIVE_SCOPES,
        callback=_build_drive_callback_url(),
        state=state,
        verifier=verifier,
        challenge=challenge,
    )
    return url, state


async def build_google_login_url() -> tuple[str, str]:
    """Build the Google OAuth2 authorization URL for login and return (url, state)."""
    state = secrets.token_urlsafe(32)
    verifier, challenge = _generate_pkce()
    redis = await get_redis()
    payload = {"v": "1", "flow": "login", "verifier": verifier}
    await redis.set(_state_key(state), json.dumps(payload), ex=STATE_TTL)

    callback = f"{settings.frontend_base_url}/auth/callback/google-login"
    url = await _build_authorization_url(
        scopes=YOUTUBE_SCOPES,
        callback=callback,
        state=state,
        verifier=verifier,
        challenge=challenge,
    )
    return url, state


async def exchange_code_for_tokens(code: str, redirect_uri: str | None = None, code_verifier: str | None = None) -> dict:
    """Exchange an authorization code for access/refresh tokens.

    Returns dict with: access_token, refresh_token, expires_in, id_token
    """
    callback = redirect_uri or _build_callback_url()
    post_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": callback,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
    }
    if code_verifier:
        post_data["code_verifier"] = code_verifier
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data=post_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            data = resp.json()
            if resp.status_code != 200:
                logger.warning("google token exchange failed", status=resp.status_code, response=data)
                raise HTTPException(status_code=400, detail="Google authorization failed. Please try linking again.")
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("google token exchange request failed")
        raise HTTPException(status_code=502, detail="Unable to connect to Google. Please try again.") from err

    return data


async def refresh_google_token(refresh_token: str) -> dict:
    """Refresh an expired access token. Returns tokens dict or raises.

    Raises:
        TokenRevokedError — the user revoked access on Google's side.
        HTTPException(401) — session expired / needs re-link.
        HTTPException(502) — network / transient error.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            data = resp.json()
            if resp.status_code == 400 and data.get("error") == "invalid_grant":
                logger.warning("google token revoked externally")
                raise TokenRevokedError("Google access was revoked externally")
            if resp.status_code != 200:
                logger.warning("google token refresh failed", status=resp.status_code)
                raise HTTPException(status_code=401, detail="Google session expired. Please reconnect your account.")
    except (HTTPException, TokenRevokedError):
        raise
    except Exception as err:
        logger.exception("google token refresh request failed")
        raise HTTPException(status_code=502, detail="Unable to connect to Google. Please try again.") from err

    return data


async def get_google_user_profile(access_token: str) -> dict | None:
    """Fetch the current user's Google profile via OpenID Connect userinfo."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        logger.exception("google user profile fetch failed")
        return None


async def consume_state(state: str) -> dict:
    """Validate and consume an OAuth state parameter. Returns the stored payload."""
    redis = await get_redis()
    key = _state_key(state)
    raw = await redis.get(key)
    if not raw:
        raise HTTPException(status_code=400, detail="Google linking session expired. Please try again.")
    await redis.delete(key)

    try:
        payload = json.loads(raw) if isinstance(raw, str) else {}
    except (json.JSONDecodeError, TypeError):
        payload = {}
    return payload if isinstance(payload, dict) else {}


async def find_or_create_google_user(
    session: AsyncSession,
    google_id: str,
    email: str = "",
    name: str = "",
    avatar_url: str | None = None,
    access_token: str | None = None,
    refresh_token: str | None = None,
    expires_in: int = 3600,
) -> User:
    """Find an existing user by google_id or create a new one."""
    user = await session.scalar(select(User).where(User.google_id == google_id))
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        return user

    base_username = re.sub(r"[^a-zA-Z0-9_-]", "", name.split("@")[0] if "@" in name else name)[:64]
    if not base_username:
        base_username = f"google_{google_id[:8]}"

    username = base_username
    suffix = 1
    while True:
        existing = await session.scalar(select(User).where(User.username == username))
        if existing is None:
            break
        username = f"{base_username}_{suffix}"
        suffix += 1

    from otix.services.auth.auth_service import hash_password

    user_email = email or f"google_{google_id}@user.otix"
    user = User(
        email=user_email,
        username=username,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        google_id=google_id,
        google_email=email or None,
        google_name=name or None,
        google_avatar_url=avatar_url,
        google_access_token=access_token,
        google_refresh_token=refresh_token,
        google_token_expires_at=datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in else None,
        is_verified=True,
        avatar_url=avatar_url,
    )
    session.add(user)
    await session.flush()
    logger.info("google user created", user_id=user.id, google_id=google_id)
    return user


async def link_google_to_user(session: AsyncSession, user: User | None = None, code: str = "", state: str = "") -> None:
    """Link a Google account to an existing user via OAuth code + state.

    The user can be provided directly or looked up from the OAuth state
    stored in Redis (set during the initiate phase).
    """
    state_payload = await consume_state(state)
    state_user_id = state_payload.get("user_id")

    resolved_user = user
    if resolved_user is None and state_user_id:
        resolved_user = await session.scalar(select(User).where(User.id == state_user_id))

    if resolved_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in and try again.",
        )

    if resolved_user.google_id is not None:
        raise HTTPException(status_code=400, detail="Google account already linked")

    user = resolved_user  # keep using `user` alias below

    tokens = await exchange_code_for_tokens(code, code_verifier=state_payload.get("verifier"))

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    if not access_token:
        raise HTTPException(status_code=502, detail="Google returned an invalid response. Please try again.")

    profile = await get_google_user_profile(access_token)
    if not profile:
        raise HTTPException(status_code=502, detail="Unable to fetch Google profile. Please try again.")

    google_id = profile.get("sub")
    if not google_id:
        raise HTTPException(status_code=502, detail="Google returned an invalid profile. Please try again.")

    # Check for duplicate links
    existing = await session.scalar(select(User).where(User.google_id == google_id))
    if existing is not None and existing.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Google account is already linked to another Otix account.",
        )

    user.google_id = google_id
    user.google_email = profile.get("email")
    user.google_name = profile.get("name")
    user.google_avatar_url = profile.get("picture")
    user.google_access_token = access_token
    user.google_refresh_token = refresh_token
    user.google_token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    await session.flush()
    logger.info("google account linked", user_id=user.id, google_id=google_id)


async def link_google_drive_to_user(
    session: AsyncSession,
    user: User | None = None,
    code: str = "",
    state: str = "",
) -> None:
    """Link Google Drive (drive.file scope) to an existing user.

    Stores the Drive-scoped tokens separately from the YouTube-scoped
    Google tokens because Google forbids requesting both scopes together.
    """
    state_payload = await consume_state(state)
    state_user_id = state_payload.get("user_id")

    resolved_user = user
    if resolved_user is None and state_user_id:
        resolved_user = await session.scalar(select(User).where(User.id == state_user_id))

    if resolved_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in and try again.",
        )

    tokens = await exchange_code_for_tokens(
        code,
        redirect_uri=_build_drive_callback_url(),
        code_verifier=state_payload.get("verifier"),
    )

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    if not access_token:
        raise HTTPException(status_code=502, detail="Google returned an invalid response. Please try again.")

    resolved_user.drive_access_token = access_token
    resolved_user.drive_refresh_token = refresh_token
    resolved_user.drive_token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    await session.flush()
    logger.info("google drive linked", user_id=resolved_user.id)


async def unlink_google_from_user(session: AsyncSession, user: User) -> None:
    """Remove the Google link from a user."""
    if user.google_id is None:
        raise HTTPException(status_code=400, detail="No Google account linked")
    google_id = user.google_id
    user.google_id = None
    user.google_email = None
    user.google_name = None
    user.google_avatar_url = None
    user.google_access_token = None
    user.google_refresh_token = None
    user.google_token_expires_at = None
    await session.flush()
    logger.info("google account unlinked", user_id=user.id, google_id=google_id)


async def unlink_google_drive_from_user(session: AsyncSession, user: User) -> None:
    """Remove the Google Drive link from a user."""
    if user.drive_refresh_token is None:
        raise HTTPException(status_code=400, detail="No Google Drive account linked")
    user.drive_access_token = None
    user.drive_refresh_token = None
    user.drive_token_expires_at = None
    await session.flush()
    logger.info("google drive unlinked", user_id=user.id)


async def get_user_google_access_token(
    user: User,
    session: AsyncSession | None = None,
) -> str | None:
    """Get a valid access token for the user, refreshing if expired.

    When *session* is provided and the token has been revoked externally,
    the integration is automatically unlinked so the UI shows the
    correct disconnected state.

    Returns the access token, or None if the user has no Google link
    or the token could not be obtained.
    """
    if not user.google_refresh_token:
        return None

    expires_at = user.google_token_expires_at
    if expires_at and isinstance(expires_at, datetime):
        if datetime.now(UTC) < expires_at - timedelta(seconds=60):
            return user.google_access_token

    try:
        tokens = await refresh_google_token(user.google_refresh_token)
    except TokenRevokedError:
        logger.warning(
            "google token revoked externally — auto-disconnecting",
            user_id=user.id,
        )
        if session is not None:
            await _unlink_google_quietly(session, user)
        return None
    except Exception:
        return None

    new_access = tokens.get("access_token")
    if not new_access:
        return None

    user.google_access_token = new_access
    expires_in = tokens.get("expires_in", 3600)
    user.google_token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    return new_access


async def _unlink_google_quietly(session: AsyncSession, user: User) -> None:
    """Unlink Google from the user without raising on already-unlinked.

    Sends a notification to the user about the disconnect.
    """
    if user.google_id is None:
        return
    google_id = user.google_id
    user.google_id = None
    user.google_email = None
    user.google_name = None
    user.google_avatar_url = None
    user.google_access_token = None
    user.google_refresh_token = None
    user.google_token_expires_at = None
    try:
        await session.flush()
        from otix.services.notification_service import NotificationService

        nsvc = NotificationService(session)
        await nsvc.create(
            user_id=user.id,
            type_="integration_disconnected",
            title="Google disconnected",
            body="Your Google account was disconnected because access was revoked externally. Re-link your account in Settings to continue syncing.",
            metadata_json={"provider": "google", "reason": "external_revocation"},
        )
        await session.commit()
        logger.info(
            "google auto-disconnected due to external revocation",
            user_id=user.id,
            google_id=google_id,
        )
    except Exception:
        await session.rollback()
        logger.exception(
            "google auto-disconnect failed",
            user_id=user.id,
            google_id=google_id,
        )


async def get_user_google_drive_access_token(
    user: User,
    session: AsyncSession | None = None,
) -> str | None:
    """Get a valid Drive-scoped access token, refreshing if expired.

    When *session* is provided and the token has been revoked externally,
    the Drive link is automatically removed so the UI shows the correct
    disconnected state.
    """
    if not user.drive_refresh_token:
        return None

    expires_at = user.drive_token_expires_at
    if expires_at and isinstance(expires_at, datetime):
        if datetime.now(UTC) < expires_at - timedelta(seconds=60):
            return user.drive_access_token

    try:
        tokens = await refresh_google_token(user.drive_refresh_token)
    except TokenRevokedError:
        logger.warning(
            "google drive token revoked externally — auto-disconnecting",
            user_id=user.id,
        )
        if session is not None:
            await _unlink_drive_quietly(session, user)
        return None
    except Exception:
        return None

    new_access = tokens.get("access_token")
    if not new_access:
        return None

    user.drive_access_token = new_access
    expires_in = tokens.get("expires_in", 3600)
    user.drive_token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    return new_access


async def _unlink_drive_quietly(session: AsyncSession, user: User) -> None:
    """Remove the Google Drive link without raising on already-unlinked.

    Sends a notification to the user about the disconnect.
    """
    if user.drive_refresh_token is None:
        return
    user.drive_access_token = None
    user.drive_refresh_token = None
    user.drive_token_expires_at = None
    try:
        await session.flush()
        from otix.services.notification_service import NotificationService

        nsvc = NotificationService(session)
        await nsvc.create(
            user_id=user.id,
            type_="integration_disconnected",
            title="Google Drive disconnected",
            body="Your Google Drive connection was removed because access was revoked externally. Re-link it in Settings to continue backing up saves.",
            metadata_json={"provider": "google_drive", "reason": "external_revocation"},
        )
        await session.commit()
        logger.info("google drive auto-disconnected due to external revocation", user_id=user.id)
    except Exception:
        await session.rollback()
        logger.exception("google drive auto-disconnect failed", user_id=user.id)
