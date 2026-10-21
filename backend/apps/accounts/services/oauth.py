"""Google / Google-Drive OAuth link + token service.

Port of the legacy link-only family (``old-backend/otix/api/auth/oauth/google*``
and ``…/google_drive/*`` driving ``google_auth_service.py``). Behaviour mirrors
the frozen contract string-for-string:

- link initiate (authed) returns ``{auth_url, state}`` and stashes the PKCE
  verifier + owning ``user_id`` in single-use state;
- link callback (unauthed: Electron lands here) exchanges ``code`` for tokens,
  fetches the OIDC profile, and writes the google_*/drive_* user columns;
- disconnect (authed) nulls the columns;
- ``google/token`` lazily refreshes via the stored refresh token.

Google-Drive is **link-only** (no login family). Google's *login* family and the
plex/steam/tmdb link+login families reuse this state/service shape in the next
increment.

Outbound HTTP is ``urllib`` (the repo has no requests/httpx dep). Single-use
state is DB-backed (``OAuthState``) rather than Redis — see that model.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone

from apps.accounts.models import OAUTH_STATE_TTL_SECONDS, OAuthState, User
from core.image_url import clean_image_url

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

GOOGLE_LOGIN_SCOPES = [
    "openid",
    "email",
    "profile",
]
YOUTUBE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/youtube",
]
DRIVE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]

GOOGLE_OAUTH_FLOW = "youtube"  # youtube link scopes are the youtube+identity set
GOOGLE_LOGIN_FLOW = "login"  # google login carries only the identity set
DRIVE_OAUTH_FLOW = "drive"

PLEX_STATE_TTL_SECONDS = 900  # legacy TTL["AUTH"]["PLEX_PIN"] = 900

_PLEX_TOKEN_COLUMNS = (
    "plex_id",
    "plex_username",
    "plex_email",
    "plex_thumb",
    "plex_auth_token",
)

_GOOGLE_TOKEN_COLUMNS = (
    "google_id",
    "google_email",
    "google_name",
    "google_avatar_url",
    "google_access_token",
    "google_refresh_token",
    "google_token_expires_at",
)
_DRIVE_TOKEN_COLUMNS = (
    "drive_access_token",
    "drive_refresh_token",
    "drive_token_expires_at",
)


class OAuthProviderError(Exception):
    """The outbound call failed at the network layer (nothing reached the IdP)."""


class OAuthFlowError(Exception):
    """A user-facing flow error carrying the HTTP status + ``detail`` to return."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ── Low-level helpers ─────────────────────────────────────────────────────


def _request(
    url: str,
    *,
    method: str = "GET",
    form: dict | None = None,
    data: str | bytes | None = None,
    headers: dict | None = None,
    timeout: float = 15.0,
) -> tuple[int, str]:
    """Return ``(status, body_text)``; raises ``OAuthProviderError`` on network failure.

    ``form`` url-encodes a dict (form content-type added); ``data`` posts a
    pre-encoded body verbatim (used by Steam's OpenID replay, which must
    preserve the original key casing byte-for-byte).
    """
    payload = None
    if form is not None:
        payload = urllib.parse.urlencode(form).encode("ascii")
        headers = dict(headers or {})
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        payload = data.encode("ascii") if isinstance(data, str) else data
    request = urllib.request.Request(url, data=payload, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:  # provider answered with an error status
        return exc.code, exc.read().decode("utf-8", "replace")
    except (urllib.error.URLError, OSError) as exc:
        raise OAuthProviderError(str(exc)) from exc


def _parse_json(raw: str) -> dict:
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def _s256(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _google_credentials() -> tuple[str, str]:
    return (
        getattr(settings, "GOOGLE_CLIENT_ID", "") or "",
        getattr(settings, "GOOGLE_CLIENT_SECRET", "") or "",
    )


def _callback_url(provider: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}/auth/callback/{provider}"


def _login_callback_url(provider: str) -> str:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}/auth/callback/{provider}-login"


# ── Single-use state ──────────────────────────────────────────────────────


def _store_state(
    flow: str,
    *,
    user_id: int | None,
    source: str | None = None,
    redirect_uri: str | None = None,
) -> tuple[str, str]:
    """Persist one flow state; returns the ``state`` value + PKCE verifier."""
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    payload: dict[str, Any] = {"v": "1", "flow": flow, "verifier": verifier}
    if user_id is not None:
        payload["user_id"] = user_id
    if source:
        payload["source"] = source
    if redirect_uri:
        payload["redirect_uri"] = redirect_uri
    OAuthState.objects.create(key=state, payload=payload)
    return state, verifier


def peek_state(state: str, *, ttl_seconds: int = OAUTH_STATE_TTL_SECONDS) -> dict | None:
    """Non-destructively read one state; ``None`` when absent or expired."""
    try:
        row = OAuthState.objects.get(key=state)
    except OAuthState.DoesNotExist:
        return None
    age = timezone.now() - row.created_at
    if age > timedelta(seconds=ttl_seconds):
        return None
    return row.payload


def _consume_state(state: str, *, ttl_seconds: int = OAUTH_STATE_TTL_SECONDS) -> dict | None:
    """Atomically read+delete one state; ``None`` when absent or expired."""
    try:
        row = OAuthState.objects.get(key=state)
    except OAuthState.DoesNotExist:
        return None
    row.delete()  # single-use regardless of expiry outcome
    age = timezone.now() - row.created_at
    if age > timedelta(seconds=ttl_seconds):
        return None
    return row.payload


# ── Auth-URL builders (link initiate) ─────────────────────────────────────


def _require_google_configured(detail: str) -> None:
    client_id, client_secret = _google_credentials()
    if not client_id or not client_secret:
        raise OAuthFlowError(503, detail)


def _authorization_url(
    flow: str,
    provider: str,
    *,
    user_id: int | None = None,
    callback: str | None = None,
    source: str | None = None,
) -> tuple[str, str]:
    client_id, _ = _google_credentials()
    redirect_uri = callback or _callback_url(provider)
    state, verifier = _store_state(
        flow, user_id=user_id, source=source, redirect_uri=redirect_uri
    )
    if flow == GOOGLE_LOGIN_FLOW:
        scopes = GOOGLE_LOGIN_SCOPES
    elif flow == GOOGLE_OAUTH_FLOW:
        scopes = YOUTUBE_SCOPES
    else:
        scopes = DRIVE_SCOPES
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge": _s256(verifier),
        "code_challenge_method": "S256",
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}", state


def build_google_link_url(user_id: int, source: str | None = None) -> tuple[str, str]:
    """Google (youtube-identity scope) link initiate -> ``{auth_url, state}``."""
    _require_google_configured("Google authentication is not configured.")
    return _authorization_url(GOOGLE_OAUTH_FLOW, "google", user_id=user_id, source=source)


def build_google_drive_link_url(user_id: int, source: str | None = None) -> tuple[str, str]:
    """Google-Drive link initiate (drive.file scope) -> ``{auth_url, state}``."""
    _require_google_configured("Google authentication not configured.")
    return _authorization_url(DRIVE_OAUTH_FLOW, "google-drive", user_id=user_id, source=source)


def build_google_login_url(source: str | None = None) -> tuple[str, str]:
    """Google login initiate (no owning user) -> ``{auth_url, state}``."""
    _require_google_configured("Google authentication is not configured.")
    return _authorization_url(
        GOOGLE_LOGIN_FLOW, "google", callback=_login_callback_url("google"), source=source
    )


# ── Callback: code -> tokens -> profile -> user columns ──────────────────


def _resolve_callback_user(payload: dict, request_user) -> User:
    if request_user is not None and request_user.is_authenticated:
        return request_user
    user_id = (payload or {}).get("user_id")
    if user_id is None:
        raise OAuthFlowError(401, "Authentication required. Please sign in and try again.")
    try:
        return User.objects.get(pk=user_id)
    except (User.DoesNotExist, TypeError, ValueError):
        raise OAuthFlowError(
            401, "Authentication required. Please sign in and try again."
        ) from None


def _exchange_code(
    code: str, verifier: str, provider: str, *, redirect_uri: str | None = None
) -> dict:
    client_id, client_secret = _google_credentials()
    try:
        status, raw = _request(
            GOOGLE_TOKEN_URL,
            method="POST",
            form={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri or _callback_url(provider),
                "client_id": client_id,
                "client_secret": client_secret,
                "code_verifier": verifier,
            },
        )
    except OAuthProviderError:
        raise OAuthFlowError(502, "Unable to connect to Google. Please try again.") from None
    if status != 200:
        raise OAuthFlowError(400, "Google authorization failed. Please try linking again.")
    tokens = _parse_json(raw)
    if not tokens.get("access_token"):
        raise OAuthFlowError(502, "Google returned an invalid response. Please try again.")
    return tokens


def _fetch_google_profile(access_token: str) -> dict:
    try:
        status, raw = _request(
            GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
    except OAuthProviderError:
        raise OAuthFlowError(502, "Unable to fetch Google profile. Please try again.") from None
    if status != 200:
        raise OAuthFlowError(502, "Unable to fetch Google profile. Please try again.")
    profile = _parse_json(raw)
    if not profile.get("sub"):
        raise OAuthFlowError(502, "Google returned an invalid profile. Please try again.")
    return profile


def _expiry_from(tokens: dict):
    expires_in = tokens.get("expires_in")
    if expires_in is None:
        return None
    try:
        return timezone.now() + timedelta(seconds=int(expires_in))
    except (TypeError, ValueError):
        return None


def link_google_to_user(request_user, code: str, state: str) -> str | None:
    """Consume the link state and bind Google to the owning user."""
    _require_google_configured("Google authentication is not configured.")
    payload = _consume_state(state)
    if payload is None:
        raise OAuthFlowError(400, "Google linking session expired. Please try again.")
    user = _resolve_callback_user(payload, request_user)
    if user.google_id:
        raise OAuthFlowError(400, "Google account already linked")
    tokens = _exchange_code(
        code, payload.get("verifier", ""), "google", redirect_uri=payload.get("redirect_uri")
    )
    profile = _fetch_google_profile(tokens["access_token"])
    if User.objects.filter(google_id=profile["sub"]).exclude(pk=user.pk).exists():
        raise OAuthFlowError(409, "This Google account is already linked to another Otix account.")
    user.google_id = profile["sub"]
    user.google_email = profile.get("email")
    user.google_name = profile.get("name")
    user.google_avatar_url = clean_image_url(profile.get("picture"))
    user.google_access_token = tokens.get("access_token")
    user.google_refresh_token = tokens.get("refresh_token")
    user.google_token_expires_at = _expiry_from(tokens)
    user.save(update_fields=_GOOGLE_TOKEN_COLUMNS)
    return payload.get("source")


def link_google_drive_to_user(request_user, code: str, state: str) -> str | None:
    """Consume the link state and bind Google-Drive to the owning user.

    Drive has no profile fetch and no duplicate/revoke guard: the refresh token
    alone marks the connection.
    """
    _require_google_configured("Google authentication not configured.")
    payload = _consume_state(state)
    if payload is None:
        raise OAuthFlowError(400, "Google linking session expired. Please try again.")
    user = _resolve_callback_user(payload, request_user)
    tokens = _exchange_code(
        code, payload.get("verifier", ""), "google-drive", redirect_uri=payload.get("redirect_uri")
    )
    user.drive_access_token = tokens.get("access_token")
    user.drive_refresh_token = tokens.get("refresh_token")
    user.drive_token_expires_at = _expiry_from(tokens)
    user.save(update_fields=_DRIVE_TOKEN_COLUMNS)
    return payload.get("source")


# ── Google login family (find-or-create, no owning user) ──────────────────


def find_or_create_google_user(
    google_id: str,
    *,
    email: str,
    name: str,
    avatar_url: str | None,
    access_token: str | None,
    refresh_token: str | None,
    expires_in: int,
) -> User:
    """Return the Otix account owning ``google_id``, creating it on first login."""
    existing = User.objects.filter(google_id=google_id).first()
    if existing is not None:
        if not existing.is_active:
            raise OAuthFlowError(403, "Account is deactivated")
        return existing
    base = re.sub(r"[^A-Za-z0-9_-]", "", name.split("@")[0] if "@" in name else name)[:64]
    if not base:
        base = f"google_{google_id[:8]}"
    candidate, suffix = base, 2
    while User.objects.filter(username=candidate).exists():
        suffix_part = f"_{suffix}"
        candidate = base[: 64 - len(suffix_part)] + suffix_part
        suffix += 1
    user = User.objects.create_user(
        username=candidate,
        email=(email or f"google_{google_id}@user.otix") or None,
        password=secrets.token_urlsafe(32),
        is_verified=True,
        avatar_url=avatar_url,
        google_id=google_id,
        google_email=email or None,
        google_name=name or None,
        google_avatar_url=avatar_url,
        google_access_token=access_token,
        google_refresh_token=refresh_token,
        google_token_expires_at=_expiry_from({"expires_in": expires_in}),
    )
    return user


def authenticate_google_login(code: str, state: str) -> User:
    """Consume a login state and return the resolved/created Google user."""
    _require_google_configured("Google authentication is not configured.")
    payload = _consume_state(state)
    if payload is None:
        raise OAuthFlowError(400, "Google linking session expired. Please try again.")
    tokens = _exchange_code(
        code,
        payload.get("verifier", ""),
        "google",
        redirect_uri=payload.get("redirect_uri") or _login_callback_url("google"),
    )
    profile = _fetch_google_profile(tokens["access_token"])
    google_id = profile["sub"]
    user = find_or_create_google_user(
        google_id,
        email=profile.get("email", ""),
        name=profile.get("name", ""),
        avatar_url=clean_image_url(profile.get("picture")),
        access_token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        expires_in=tokens.get("expires_in", 3600),
    )
    if payload.get("source"):
        user._oauth_source = payload.get("source")
    return user


# ── Disconnect ────────────────────────────────────────────────────────────


def unlink_google_from_user(user: User) -> None:
    if user.google_id is None:
        raise OAuthFlowError(400, "No Google account linked")
    for column in _GOOGLE_TOKEN_COLUMNS:
        setattr(user, column, None)
    user.save(update_fields=_GOOGLE_TOKEN_COLUMNS)


def unlink_google_drive_from_user(user: User) -> None:
    if user.drive_refresh_token is None:
        raise OAuthFlowError(400, "No Google Drive account linked")
    for column in _DRIVE_TOKEN_COLUMNS:
        setattr(user, column, None)
    user.save(update_fields=_DRIVE_TOKEN_COLUMNS)


# ── google/token: cached access or silent refresh ─────────────────────────


def _quietly_unlink(user: User, columns: tuple[str, ...], provider: str) -> None:
    for column in columns:
        setattr(user, column, None)
    user.save(update_fields=columns)
    from apps.social.models import Notification  # local: accounts -> social is a leaf dep

    titles = {
        "google": "Google disconnected",
        "google_drive": "Google Drive disconnected",
    }
    bodies = {
        "google": (
            "Your Google account was disconnected because access was revoked externally. "
            "Re-link your account in Settings to continue syncing."
        ),
        "google_drive": (
            "Your Google Drive connection was removed because access was revoked "
            "externally. Re-link it in Settings to continue backing up saves."
        ),
    }
    try:
        Notification.objects.create(
            user=user,
            type="integration_disconnected",
            title=titles[provider],
            body=bodies[provider],
            metadata_json={"provider": provider, "reason": "external_revocation"},
        )
    except Exception:  # noqa: BLE001 - a notification must never break the request
        logger.exception("integration_disconnected notification create failed")


def _refresh_google_token(user: User) -> str | None:
    """Refresh ``user``'s google access token; unlinks quietly on external revoke."""
    if not user.google_refresh_token:
        return None
    client_id, client_secret = _google_credentials()
    try:
        status, raw = _request(
            GOOGLE_TOKEN_URL,
            method="POST",
            form={
                "grant_type": "refresh_token",
                "refresh_token": user.google_refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
    except OAuthProviderError:
        return None
    body = _parse_json(raw)
    if status == 400 and body.get("error") == "invalid_grant":
        _quietly_unlink(user, _GOOGLE_TOKEN_COLUMNS, "google")
        return None
    if status != 200:
        return None
    access = body.get("access_token")
    if not access:
        return None
    user.google_access_token = access
    try:
        user.google_token_expires_at = timezone.now() + timedelta(
            seconds=int(body.get("expires_in", 3600))
        )
    except (TypeError, ValueError):
        user.google_token_expires_at = timezone.now() + timedelta(seconds=3600)
    user.save(update_fields=("google_access_token", "google_token_expires_at"))
    return access


def get_user_google_access_token(user: User) -> str | None:
    """Return a usable google access token, refreshing when near/over expiry."""
    if not user.google_refresh_token:
        return None
    expires_at = user.google_token_expires_at
    if expires_at is not None and timezone.now() < expires_at - timedelta(seconds=60):
        return user.google_access_token
    return _refresh_google_token(user)


def _refresh_drive_token(user: User) -> str | None:
    """Refresh ``user``'s Drive-scoped access token; unlinks quietly on revoke."""
    if not user.drive_refresh_token:
        return None
    client_id, client_secret = _google_credentials()
    try:
        status, raw = _request(
            GOOGLE_TOKEN_URL,
            method="POST",
            form={
                "grant_type": "refresh_token",
                "refresh_token": user.drive_refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
    except OAuthProviderError:
        return None
    body = _parse_json(raw)
    if status == 400 and body.get("error") == "invalid_grant":
        _quietly_unlink(user, _DRIVE_TOKEN_COLUMNS, "google_drive")
        return None
    if status != 200:
        return None
    access = body.get("access_token")
    if not access:
        return None
    user.drive_access_token = access
    try:
        user.drive_token_expires_at = timezone.now() + timedelta(
            seconds=int(body.get("expires_in", 3600))
        )
    except (TypeError, ValueError):
        user.drive_token_expires_at = timezone.now() + timedelta(seconds=3600)
    user.save(update_fields=("drive_access_token", "drive_token_expires_at"))
    return access


def get_user_google_drive_access_token(user: User) -> str | None:
    """Return a usable Drive-scoped access token, refreshing when near/over expiry.

    Mirrors legacy ``google_auth_service.get_user_google_drive_access_token``:
    an absent refresh token, an unreachable refresh, or an externally-revoked
    refresh all return ``None`` (the cloud-save routes then 401 as not linked).
    """
    if not user.drive_refresh_token:
        return None
    expires_at = user.drive_token_expires_at
    if expires_at is not None and timezone.now() < expires_at - timedelta(seconds=60):
        return user.drive_access_token
    return _refresh_drive_token(user)


# ── Plex (public PIN auth; link + login) ─────────────────────────────────


def _plex_headers() -> dict[str, str]:
    """Common Plex.tv headers: the PIN/user API identifies the calling client."""
    return {
        "Accept": "application/json",
        "X-Plex-Client-Identifier": getattr(settings, "PLEX_CLIENT_IDENTIFIER", "otix-web"),
        "X-Plex-Product": getattr(settings, "PLEX_PRODUCT", "Otix"),
        "X-Plex-Version": getattr(settings, "PLEX_VERSION", "0.1.0"),
    }


def _plex_tv_base() -> str:
    return (getattr(settings, "PLEX_TV_BASE", "") or "https://plex.tv").rstrip("/")


def _plex_auth_base() -> str:
    return (getattr(settings, "PLEX_AUTH_URL", "") or "https://app.plex.tv/auth").rstrip("/")


def _frontend_base() -> str:
    return (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")


def _create_plex_pin(start_error: str, invalid_error: str) -> tuple[str, str]:
    """Create a Plex PIN; returns ``(pin_id, code)``."""
    try:
        status, raw = _request(
            f"{_plex_tv_base()}/api/v2/pins?strong=true", method="POST", headers=_plex_headers()
        )
    except OAuthProviderError:
        raise OAuthFlowError(502, start_error) from None
    if status < 200 or status >= 300:
        raise OAuthFlowError(502, start_error)
    body = _parse_json(raw)
    pin_id = body.get("id")
    code = body.get("code")
    if not pin_id or not code:
        raise OAuthFlowError(502, invalid_error)
    return str(pin_id), str(code)


def _plex_auth_url(code: str, state: str, callback: str, source: str | None = None) -> str:
    forward_params = {"state": state}
    if source:
        forward_params["source"] = source
    forward_url = f"{callback}?{urllib.parse.urlencode(forward_params)}"
    params = {
        "clientID": getattr(settings, "PLEX_CLIENT_IDENTIFIER", "otix-web"),
        "code": code,
        "forwardUrl": forward_url,
        "context[device][product]": getattr(settings, "PLEX_PRODUCT", "Otix"),
        "context[device][version]": getattr(settings, "PLEX_VERSION", "0.1.0"),
    }
    return f"{_plex_auth_base()}#?{urllib.parse.urlencode(params)}"


def build_plex_link_url(user_id: int, source: str | None = None) -> tuple[str, str, str]:
    """Plex link initiate -> ``(auth_url, state, pin_id)``."""
    pin_id, code = _create_plex_pin(
        "Unable to start Plex linking. Please try again.",
        "Plex returned an invalid linking response. Please try again.",
    )
    state = secrets.token_urlsafe(32)
    payload = {"v": "1", "pin_id": pin_id, "user_id": user_id}
    if source:
        payload["source"] = source
    OAuthState.objects.create(key=state, payload=payload)
    callback = _callback_url("plex")
    return _plex_auth_url(code, state, callback, source=source), state, pin_id


def build_plex_login_url(source: str | None = None) -> tuple[str, str, str]:
    """Plex login initiate (no owning user) -> ``(auth_url, state, pin_id)``."""
    pin_id, code = _create_plex_pin(
        "Unable to start Plex login. Please try again.",
        "Plex returned an invalid response. Please try again.",
    )
    state = secrets.token_urlsafe(32)
    payload = {"v": "1", "pin_id": pin_id, "flow": "login"}
    if source:
        payload["source"] = source
    OAuthState.objects.create(key=state, payload=payload)
    callback = f"{_frontend_base()}/auth/callback/plex-login"
    return _plex_auth_url(code, state, callback, source=source), state, pin_id


def _get_plex_pin_auth_token(pin_id: str) -> str | None:
    """One-shot poll of the PIN; ``None`` when Plex has not yet approved it."""
    try:
        status, raw = _request(f"{_plex_tv_base()}/api/v2/pins/{pin_id}", headers=_plex_headers())
    except OAuthProviderError:
        raise OAuthFlowError(502, "Unable to verify with Plex. Please try again.") from None
    if status != 200:
        raise OAuthFlowError(502, "Unable to verify with Plex. Please try again.")
    body = _parse_json(raw)
    token = body.get("authToken") or body.get("auth_token")
    return str(token) if token else None


def _get_plex_user_info(auth_token: str) -> dict:
    try:
        status, raw = _request(
            f"{_plex_tv_base()}/api/v2/user",
            headers={**_plex_headers(), "X-Plex-Token": auth_token},
        )
    except OAuthProviderError:
        raise OAuthFlowError(
            502, "Unable to fetch Plex account details. Please try again."
        ) from None
    if status != 200:
        raise OAuthFlowError(502, "Unable to fetch Plex account details. Please try again.")
    return _parse_json(raw)


def _plex_identity(profile: dict) -> str:
    plex_id = str(profile.get("id") or profile.get("uuid") or "")
    if not plex_id:
        raise OAuthFlowError(502, "Plex returned an invalid account profile. Please try again.")
    return plex_id


def link_plex_to_user(request_user, state: str, pin_id: str | None) -> str | None:
    """Consume the link state and bind the Plex account to the owning user."""
    payload = _consume_state(state, ttl_seconds=PLEX_STATE_TTL_SECONDS)
    if payload is None:
        raise OAuthFlowError(400, "Plex linking session expired. Please try again.")
    stored_pin = payload.get("pin_id")
    if pin_id and str(stored_pin) != str(pin_id):
        raise OAuthFlowError(400, "Invalid Plex linking session. Please try again.")
    user = _resolve_callback_user(payload, request_user)
    if user.plex_id:
        raise OAuthFlowError(400, "Plex account already linked")
    token = _get_plex_pin_auth_token(str(stored_pin))
    if token is None:
        raise OAuthFlowError(400, "Plex has not approved this link yet. Please finish signing in.")
    profile = _get_plex_user_info(token)
    plex_id = _plex_identity(profile)
    if User.objects.filter(plex_id=plex_id).exclude(pk=user.pk).exists():
        raise OAuthFlowError(409, "This Plex account is already linked to another Otix account.")
    user.plex_id = plex_id
    user.plex_username = profile.get("username") or profile.get("title")
    user.plex_email = profile.get("email")
    user.plex_thumb = profile.get("thumb")
    user.plex_auth_token = token
    user.save(update_fields=_PLEX_TOKEN_COLUMNS)
    return payload.get("source")


def unlink_plex_from_user(user: User) -> None:
    if user.plex_id is None:
        raise OAuthFlowError(400, "No Plex account linked")
    for column in _PLEX_TOKEN_COLUMNS:
        setattr(user, column, None)
    user.save(update_fields=_PLEX_TOKEN_COLUMNS)


def find_or_create_plex_user(
    plex_id: str,
    *,
    username: str | None,
    email: str | None,
    thumb: str | None,
    auth_token: str,
) -> User:
    """Return the Otix account owning ``plex_id``, creating it on first login."""
    existing = User.objects.filter(plex_id=plex_id).first()
    if existing is not None:
        if not existing.is_active:
            raise OAuthFlowError(403, "Account is deactivated")
        return existing
    base = (username or email or f"plex_{plex_id[:8]}").strip()
    clean = re.sub(r"[^A-Za-z0-9_-]", "", base)[:64] or f"plex_{plex_id[:8]}"
    candidate, suffix = clean, 2
    while User.objects.filter(username=candidate).exists():
        suffix_part = f"_{suffix}"
        candidate = clean[: 64 - len(suffix_part)] + suffix_part
        suffix += 1
    user = User.objects.create_user(
        username=candidate,
        email=(email or f"plex_{plex_id}@user.otix") or None,
        password=secrets.token_urlsafe(32),
        is_verified=True,
        avatar_url=clean_image_url(thumb),
        plex_id=plex_id,
        plex_username=username,
        plex_email=email,
        plex_thumb=clean_image_url(thumb),
        plex_auth_token=auth_token,
    )
    return user


def authenticate_plex(state: str, pin_id: str | None = None) -> User:
    """Consume a login state and return the resolved/created Plex user."""
    payload = _consume_state(state, ttl_seconds=PLEX_STATE_TTL_SECONDS)
    if payload is None:
        # Legacy shares one ``_consume_state`` string across link + login flows.
        raise OAuthFlowError(400, "Plex linking session expired. Please try again.")
    stored_pin = payload.get("pin_id")
    if pin_id and str(stored_pin) != str(pin_id):
        raise OAuthFlowError(400, "Invalid Plex linking session. Please try again.")
    token = _get_plex_pin_auth_token(str(stored_pin))
    if token is None:
        # Legacy shares the link wording here too (single ``_get_pin_auth_token``).
        raise OAuthFlowError(400, "Plex has not approved this link yet. Please finish signing in.")
    profile = _get_plex_user_info(token)
    plex_id = _plex_identity(profile)
    user = find_or_create_plex_user(
        plex_id,
        username=profile.get("username") or profile.get("title"),
        email=profile.get("email"),
        thumb=profile.get("thumb"),
        auth_token=token,
    )
    if payload.get("source"):
        user._oauth_source = payload.get("source")
    return user


# ── Steam (OpenID 2.0; link + login) ─────────────────────────────────────

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
STEAM_API_BASE = "https://api.steampowered.com"
STEAM_ID_RE = re.compile(r"/id/(\d{17})$")
STEAM_STATE_TTL_SECONDS = 600  # legacy TTL["AUTH"]["STEAM_STATE"]


def _steam_api_key() -> str:
    return (getattr(settings, "STEAM_API_KEY", "") or "").strip()


def _steam_return_to_with_state(return_to: str, state: str) -> str:
    parsed = urllib.parse.urlparse(return_to)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("state", state))
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query)))


def _steam_source_url(return_to: str, source: str | None) -> str:
    if not source:
        return return_to
    separator = "&" if "?" in return_to else "?"
    return f"{return_to}{separator}source={source}"


def _steam_build_url(return_to: str, state: str) -> str:
    return_to = _steam_return_to_with_state(return_to, state)
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": _frontend_base(),
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID_URL}?{urllib.parse.urlencode(params)}"


def _store_steam_state(
    state: str, *, link: bool, user_id: int | None = None, source: str | None = None
) -> None:
    payload: dict[str, Any] = {"v": "1", "flow": "link" if link else "login"}
    if link and user_id is not None:
        payload["user_id"] = user_id
    if source:
        payload["source"] = source
    OAuthState.objects.create(key=state, payload=payload)


def _consume_steam_state(state: str, *, link: bool) -> dict | None:
    """Read+delete a steam state; ``None`` when absent, expired, or wrong flow."""
    try:
        row = OAuthState.objects.get(key=state)
    except OAuthState.DoesNotExist:
        return None
    row.delete()  # single-use regardless of expiry outcome
    age = timezone.now() - row.created_at
    if age > timedelta(seconds=STEAM_STATE_TTL_SECONDS):
        return None
    payload = row.payload
    if (payload or {}).get("flow") != ("link" if link else "login"):
        return None
    return payload


def build_steam_link_url(source: str | None, *, user_id: int) -> tuple[str, str]:
    """Steam OpenID link initiate -> ``(auth_url, state)``."""
    state = secrets.token_urlsafe(32)
    _store_steam_state(state, link=True, user_id=user_id, source=source)
    return_to = _steam_source_url(f"{_frontend_base()}/auth/callback/steam-connect", source)
    return _steam_build_url(return_to, state), state


def build_steam_login_url(source: str | None = None) -> tuple[str, str]:
    """Steam OpenID login initiate (no owning user) -> ``(auth_url, state)``."""
    state = secrets.token_urlsafe(32)
    _store_steam_state(state, link=False, source=source)
    return_to = _steam_source_url(f"{_frontend_base()}/auth/callback/steam", source)
    return _steam_build_url(return_to, state), state


def _steam_flat_params(params: dict, raw_query: str | None) -> dict[str, str]:
    if raw_query:
        return {
            str(k): str(v) for k, v in urllib.parse.parse_qsl(raw_query, keep_blank_values=True)
        }
    return {str(k): str(v) for k, v in params.items()}


def _steam_validation_body(params: dict, raw_query: str | None) -> str:
    """Reconstruct the OpenID check_authentication body byte-for-byte.

    When ``raw_query`` is present it is replayed verbatim (preserving the
    original key casing/order from Steam's redirect) with ``openid.mode``
    forced to ``check_authentication`` and ``state`` dropped.
    """
    if not raw_query:
        validate_params = _steam_flat_params(params, None)
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


def _validate_openid_response(params: dict, raw_query: str | None) -> str:
    """Replay the Steam OpenID response and return the steam64 id."""
    flat = _steam_flat_params(params, raw_query)
    if flat.get("openid.mode") != "id_res":
        raise OAuthFlowError(400, "Invalid Steam response: missing or incorrect openid.mode")
    validation_body = _steam_validation_body(params, raw_query)
    try:
        _, text = _request(
            STEAM_OPENID_URL,
            method="POST",
            data=validation_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    except OAuthProviderError:
        raise OAuthFlowError(502, "Unable to verify with Steam. Please try again.") from None
    if "is_valid:true" not in text:
        raise OAuthFlowError(400, "Steam rejected the authentication. Please try signing in again.")
    match = STEAM_ID_RE.search(flat.get("openid.claimed_id", ""))
    if not match:
        raise OAuthFlowError(400, "Invalid Steam identity in callback. Please try again.")
    return match.group(1)


class SteamAuthResult(str):
    source: str | None = None


def validate_steam_callback(params: dict, raw_query: str | None) -> str:
    """Validate the Steam login callback and return the steam64 id."""
    flat = _steam_flat_params(params, raw_query)
    state = flat.get("state")
    if not state:
        raise OAuthFlowError(
            400, "Steam authentication session expired. Please try signing in again."
        )
    payload = _consume_steam_state(str(state), link=False)
    if payload is None:
        raise OAuthFlowError(
            400, "Steam authentication session expired. Please try signing in again."
        )
    steam_id = _validate_openid_response(params, raw_query)
    res = SteamAuthResult(steam_id)
    res.source = (payload or {}).get("source") or flat.get("source")
    return res


def validate_steam_link_callback(params: dict, raw_query: str | None) -> tuple[str, int | None]:
    """Validate the Steam link callback -> ``(steam_id, state_user_id_or_None)``."""
    flat = _steam_flat_params(params, raw_query)
    state = flat.get("state")
    if not state:
        raise OAuthFlowError(
            400, "Steam authentication session expired. Please try signing in again."
        )
    payload = _consume_steam_state(str(state), link=True)
    if payload is None:
        raise OAuthFlowError(
            400, "Steam authentication session expired. Please try signing in again."
        )
    steam_id = _validate_openid_response(params, raw_query)
    return steam_id, payload.get("user_id")


def _get_steam_user_info(steam_id: str) -> dict | None:
    """Fetch the Steam player summary; ``None`` when unkeyed/unreachable."""
    if not _steam_api_key():
        return None
    query = urllib.parse.urlencode({"key": _steam_api_key(), "steamids": steam_id})
    try:
        _, raw = _request(f"{STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?{query}")
    except OAuthProviderError:
        return None
    data = _parse_json(raw)
    players = data.get("response", {}).get("players", [])
    return players[0] if players else None


def find_or_create_steam_user(steam_id: str) -> User:
    """Return the Otix account owning ``steam_id``, creating it on first login."""
    existing = User.objects.filter(steam_id=steam_id).first()
    if existing is not None:
        if not existing.is_active:
            raise OAuthFlowError(403, "Account is deactivated")
        return existing
    profile = _get_steam_user_info(steam_id)
    persona_name = f"steam_user_{steam_id}"
    avatar_url = None
    if profile is not None:
        persona_name = profile.get("personaname", f"steam_user_{steam_id}")
        avatar_url = clean_image_url(profile.get("avatarfull"))
    base = re.sub(r"[^a-zA-Z0-9_-]", "", persona_name)[:64]
    if not base:
        base = f"steam_{steam_id[:8]}"
    candidate, suffix = base, 1
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{base}_{suffix}"
    return User.objects.create_user(
        username=candidate,
        email=f"steam_{steam_id}@user.otix",
        password=secrets.token_urlsafe(32),
        steam_id=steam_id,
        is_verified=True,
        avatar_url=avatar_url,
    )


def link_steam_to_user(request_user, steam_id: str, state_user_id: int | None) -> None:
    """Bind ``steam_id`` to an authed user or the state's recorded owner."""
    resolved_user = None
    if request_user is not None and request_user.is_authenticated:
        resolved_user = request_user
    elif state_user_id is not None:
        try:
            resolved_user = User.objects.get(pk=state_user_id)
        except (User.DoesNotExist, TypeError, ValueError):
            resolved_user = None
    if resolved_user is None:
        raise OAuthFlowError(401, "Authentication required. Please sign in and try again.")
    if resolved_user.steam_id == steam_id:
        return  # Already linked to this same account
    if resolved_user.steam_id is not None:
        raise OAuthFlowError(
            409,
            "Your account is already linked to a different Steam account. Unlink it first.",
        )
    if User.objects.filter(steam_id=steam_id).exists():
        raise OAuthFlowError(409, "This Steam account is already linked to another Otix account.")
    resolved_user.steam_id = steam_id
    resolved_user.save(update_fields=("steam_id",))


def unlink_steam_from_user(user: User) -> None:
    if user.steam_id is None:
        raise OAuthFlowError(400, "No Steam account linked")
    user.steam_id = None
    user.save(update_fields=("steam_id",))


def authenticate_steam(params: dict, raw_query: str | None = None) -> User:
    """Consume a login callback and return the resolved/created Steam user."""
    steam_id = validate_steam_callback(params, raw_query)
    user = find_or_create_steam_user(steam_id)
    source = getattr(steam_id, "source", None) or _steam_flat_params(params, raw_query).get("source")
    if source:
        user._oauth_source = source
    return user


# ── TMDb (request_token -> session_id dance; link + login) ───────────────

TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_AUTH_BASE = "https://www.themoviedb.org/authenticate"
TMDB_STATE_TTL_SECONDS = 600  # legacy TTL["AUTH"]["TMDB_REQUEST_TOKEN"]


def _tmdb_api_key() -> str:
    return (getattr(settings, "TMDB_API_KEY", "") or "").strip()


def _tmdb_rat() -> str:
    return (getattr(settings, "TMDB_RAT", "") or "").strip()


def _tmdb_rt_key(request_token: str) -> str:
    return f"tmdb_rt:{request_token}"


class TMDbTokenResult(tuple):
    source: str | None = None

    def __new__(cls, stored_token: str, user_id: int | None, source: str | None = None):
        return super().__new__(cls, (stored_token, user_id))

    def __init__(self, stored_token: str, user_id: int | None, source: str | None = None):
        self.stored_token = stored_token
        self.user_id = user_id
        self.source = source


def _store_tmdb_state(
    state: str,
    request_token: str,
    *,
    link: bool,
    user_id: int | None = None,
    source: str | None = None,
) -> None:
    """Persist the flow under both the state key and the request token key.

    TMDb may mangle ``state`` on the way back, so the callback can recover by
    the request token (mirrors the legacy dual Redis keys).
    """
    payload: dict[str, Any] = {"v": "1", "request_token": request_token}
    payload["flow"] = "link" if link else "login"
    if link and user_id is not None:
        payload["user_id"] = user_id
    if source:
        payload["source"] = source
    OAuthState.objects.create(key=state, payload=payload)
    OAuthState.objects.create(key=_tmdb_rt_key(request_token), payload=payload)


def peek_tmdb_state(
    state: str | None,
    request_token: str | None,
    *,
    ttl_seconds: int = OAUTH_STATE_TTL_SECONDS,
) -> dict | None:
    """Non-destructively read TMDb state; None when absent or expired."""
    row = None
    if state:
        row = OAuthState.objects.filter(key=state).first()
    if row is None and request_token:
        row = OAuthState.objects.filter(key=_tmdb_rt_key(request_token)).first()
    if row is None:
        return None
    age = timezone.now() - row.created_at
    if age > timedelta(seconds=ttl_seconds):
        return None
    return row.payload


def _consume_tmdb_request_token(state: str, request_token: str | None) -> tuple[str, int | None]:
    """Read+delete the flow state; returns ``(request_token, user_id_or_None)``."""
    row = OAuthState.objects.filter(key=state).first()
    if row is None and request_token:
        row = OAuthState.objects.filter(key=_tmdb_rt_key(request_token)).first()
    if row is None:
        raise OAuthFlowError(400, "TMDb linking session expired. Please try again.")
    payload = row.payload or {}
    stored_token = str(payload.get("request_token") or "")
    user_id = payload.get("user_id")
    source = payload.get("source")
    delete_keys = {state, request_token, stored_token}
    OAuthState.objects.filter(key__in=[k for k in delete_keys if k]).delete()
    if request_token and stored_token != str(request_token):
        raise OAuthFlowError(400, "Invalid TMDb linking session. Please try again.")
    return TMDbTokenResult(stored_token, user_id, source=source)


def _tmdb_fetch_request_token(start_error: str) -> str:
    """GET a new unauth'd request token; TMDb's one-time pre-auth credential."""
    api_key = _tmdb_api_key()
    try:
        _, raw = _request(f"{TMDB_API_BASE}/authentication/token/new?api_key={api_key}")
    except OAuthProviderError:
        raise OAuthFlowError(502, start_error) from None
    data = _parse_json(raw)
    if not data.get("success"):
        raise OAuthFlowError(502, "TMDb returned an error. Please try again.")
    request_token = data.get("request_token")
    if not request_token:
        raise OAuthFlowError(502, "TMDb returned an invalid response. Please try again.")
    return request_token


def build_tmdb_link_url(
    user_id: int, redirect_url: str, source: str | None = None
) -> tuple[str, str]:
    """TMDb connect initiate -> ``(auth_url, state)``; user links server-side."""
    state = secrets.token_urlsafe(32)
    request_token = _tmdb_fetch_request_token("Unable to start TMDb linking. Please try again.")
    _store_tmdb_state(state, request_token, link=True, user_id=user_id, source=source)
    separator = "&" if "?" in redirect_url else "?"
    redirect_target = f"{redirect_url}{separator}state={state}"
    if source:
        redirect_target += f"&source={source}"
    redirect_to = urllib.parse.quote(redirect_target, safe="")
    return f"{TMDB_AUTH_BASE}/{request_token}?redirect_to={redirect_to}", state


def build_tmdb_login_url(source: str | None = None) -> tuple[str, str]:
    """TMDb login initiate (unauthed) -> ``(auth_url, state)``."""
    state = secrets.token_urlsafe(32)
    request_token = _tmdb_fetch_request_token("Unable to start TMDb login. Please try again.")
    _store_tmdb_state(state, request_token, link=False, source=source)
    redirect_target = f"{_frontend_base()}/auth/callback/tmdb-login?state={state}"
    if source:
        redirect_target += f"&source={source}"
    redirect_to = urllib.parse.quote(redirect_target, safe="")
    return f"{TMDB_AUTH_BASE}/{request_token}?redirect_to={redirect_to}", state


def _tmdb_create_session(request_token: str) -> str:
    """Exchange an approved request token for a session id."""
    api_key = _tmdb_api_key()
    try:
        _, raw = _request(
            f"{TMDB_API_BASE}/authentication/session/new?api_key={api_key}",
            method="POST",
            data=json.dumps({"request_token": request_token}),
            headers={"Content-Type": "application/json"},
        )
    except OAuthProviderError:
        raise OAuthFlowError(502, "Unable to verify with TMDb. Please try again.") from None
    data = _parse_json(raw)
    if not data.get("success"):
        raise OAuthFlowError(400, "TMDb authorization failed. Please try linking again.")
    session_id = data.get("session_id")
    if not session_id:
        raise OAuthFlowError(502, "TMDb returned an invalid session. Please try again.")
    return session_id


def _tmdb_account(session_id: str) -> dict | None:
    """Fetch the TMDb account profile; ``None`` on any failure (caller decides)."""
    api_key = _tmdb_api_key()
    try:
        _, raw = _request(f"{TMDB_API_BASE}/account?api_key={api_key}&session_id={session_id}")
        return _parse_json(raw)
    except OAuthProviderError:
        return None


def _tmdb_link_account(
    user: User, request_token: str, session_id: str, account: dict | None
) -> None:
    """Guard + write the tmdb_* columns after session creation."""
    if User.objects.exclude(pk=user.pk).filter(tmdb_session_id=session_id).exists():
        raise OAuthFlowError(409, "This TMDb account is already linked to another Otix account.")
    if account is None:
        raise OAuthFlowError(502, "Unable to fetch TMDb account details. Please try again.")
    account_id = account.get("id")
    if not account_id:
        raise OAuthFlowError(502, "TMDb returned an invalid account profile. Please try again.")
    if User.objects.exclude(pk=user.pk).filter(tmdb_account_id=int(account_id)).exists():
        raise OAuthFlowError(409, "This TMDb account is already linked to another Otix account.")
    user.tmdb_session_id = session_id
    user.tmdb_account_id = int(account_id)
    user.tmdb_username = account.get("username") or account.get("name")
    avatar = account.get("avatar")
    if isinstance(avatar, dict) and isinstance(avatar.get("gravatar"), dict):
        user.tmdb_avatar_hash = avatar["gravatar"].get("hash")
    user.save(
        update_fields=(
            "tmdb_session_id",
            "tmdb_account_id",
            "tmdb_username",
            "tmdb_avatar_hash",
        )
    )


def link_tmdb_to_user(request_user, state: str, request_token: str) -> None:
    """Bind TMDb to the authenticated user from a link callback."""
    res = _consume_tmdb_request_token(state, request_token)
    stored_token, state_user_id = res
    if state_user_id is not None and state_user_id != request_user.pk:
        raise OAuthFlowError(400, "Invalid TMDb linking session. Please try again.")
    if request_user.tmdb_session_id is not None:
        raise OAuthFlowError(400, "TMDb account already linked")
    session_id = _tmdb_create_session(stored_token)
    _tmdb_link_account(request_user, stored_token, session_id, _tmdb_account(session_id))
    if getattr(res, "source", None):
        request_user._oauth_source = res.source


def link_tmdb_state_to_user(state: str, request_token: str | None = None) -> User:
    """Bind TMDb resolving the owning user from the flow state (303 hop / no JWT)."""
    res = _consume_tmdb_request_token(state, request_token)
    stored_token, state_user_id = res
    if not state_user_id:
        raise OAuthFlowError(400, "Invalid TMDb linking session. Please try again.")
    user = User.objects.filter(pk=state_user_id).first()
    if user is None or not user.is_active:
        raise OAuthFlowError(400, "TMDb linking user is no longer available.")
    if user.tmdb_session_id is not None:
        raise OAuthFlowError(400, "TMDb account already linked")
    session_id = _tmdb_create_session(stored_token)
    _tmdb_link_account(user, stored_token, session_id, _tmdb_account(session_id))
    if getattr(res, "source", None):
        user._oauth_source = res.source
    return user


def unlink_tmdb_from_user(user: User) -> None:
    """Unlink TMDb; leaves the rating-sync columns untouched (integration-owned)."""
    if user.tmdb_session_id is None:
        raise OAuthFlowError(400, "No TMDb account linked")
    user.tmdb_session_id = None
    user.tmdb_account_id = None
    user.tmdb_username = None
    user.tmdb_avatar_hash = None
    user.save(
        update_fields=(
            "tmdb_session_id",
            "tmdb_account_id",
            "tmdb_username",
            "tmdb_avatar_hash",
        )
    )


def find_or_create_tmdb_user(session_id: str, account_id: int, username: str = "") -> User:
    """Return the Otix account owning ``account_id``, creating it on first login."""
    existing = User.objects.filter(tmdb_account_id=account_id).first()
    if existing is not None:
        if not existing.is_active:
            raise OAuthFlowError(403, "Account is deactivated")
        return existing  # fresh session deliberately not persisted on a returning user
    base = re.sub(r"[^a-zA-Z0-9_-]", "", (username or "")[:64]) or f"tmdb_{account_id}"
    candidate, suffix = base, 1
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{base}_{suffix}"
    return User.objects.create_user(
        username=candidate,
        email=f"tmdb_{account_id}@user.otix",
        password=secrets.token_urlsafe(32),
        tmdb_session_id=session_id,
        tmdb_account_id=account_id,
        tmdb_username=username or None,
        is_verified=True,
    )


def authenticate_tmdb_login(state: str, request_token: str | None) -> User:
    """Consume a TMDb login callback and return the resolved/created user."""
    res = _consume_tmdb_request_token(state, request_token)
    stored_token, _user_id = res
    session_id = _tmdb_create_session(stored_token)
    account = _tmdb_account(session_id)
    if account is None:
        raise OAuthFlowError(502, "Unable to fetch TMDb account details. Please try again.")
    account_id = account.get("id")
    if not account_id:
        raise OAuthFlowError(502, "TMDb returned an invalid account profile. Please try again.")
    user = find_or_create_tmdb_user(
        session_id, int(account_id), account.get("username") or account.get("name", "")
    )
    if getattr(res, "source", None):
        user._oauth_source = res.source
    return user


# ── OAuth aggregate reads (GET /auth/oauth + GET /auth/me/integrations) ──


def _gravatar_url(avatar_hash: str | None) -> str | None:
    if not avatar_hash:
        return None
    return f"https://www.gravatar.com/avatar/{avatar_hash}?s=200"


def steam_profile_for_user(user: User) -> dict | None:
    """SteamProfileResponse-shaped dict for GET /auth/oauth, or ``None``."""
    if user.steam_id is None:
        return None
    info = _get_steam_user_info(user.steam_id)
    if not info:
        return None
    keys = (
        "personaname",
        "avatarfull",
        "profileurl",
        "realname",
        "loccountrycode",
        "timecreated",
        "personastate",
        "lastlogoff",
    )
    return {key: info.get(key) for key in keys if key in info}


def tmdb_stats_for_user(user: User) -> dict | None:
    """TMDb rated/watchlist tallies for GET /auth/oauth, or ``None``.

    ``None`` when not linked, or when the v4 read token/API key are unset. Each
    sub-count degrades to 0 on a failed query (mirrors legacy). ``tmdb_account_id``
    absent but ``tmdb_session_id`` set keeps ``None`` (no stats without the id).
    """
    if user.tmdb_session_id is None or user.tmdb_account_id is None:
        return None
    api_key = _tmdb_api_key()
    rat = _tmdb_rat()
    if not api_key or not rat:
        return None
    stats = {"rated_movies": 0, "rated_tv": 0, "watchlist_movies": 0, "watchlist_tv": 0}
    base = f"{TMDB_API_BASE}/account/{user.tmdb_account_id}"
    common = urllib.parse.urlencode(
        {
            "api_key": api_key,
            "session_id": user.tmdb_session_id,
            "language": "en-US",
            "page": 1,
        }
    )
    headers = {"Authorization": f"Bearer {rat}"}
    routes = (
        ("rated_movies", "rated/movies", True),
        ("rated_tv", "rated/tv", True),
        ("watchlist_movies", "watchlist/movies", False),
        ("watchlist_tv", "watchlist/tv", False),
    )
    for key, path, sort in routes:
        url = f"{base}/{path}?{common}"
        if sort:
            url += "&sort_by=created_at.desc"
        try:
            _, raw = _request(url, headers=headers)
            stats[key] = int(_parse_json(raw).get("total_results", 0) or 0)
        except (OAuthProviderError, ValueError):
            stats[key] = 0
    return stats


def backfill_tmdb_avatar(user: User) -> None:
    """Fill ``tmdb_avatar_hash`` from the account gravatar when missing."""
    if user.tmdb_session_id is None or user.tmdb_avatar_hash:
        return
    account = _tmdb_account(user.tmdb_session_id)
    avatar = (account or {}).get("avatar") if account else None
    if isinstance(avatar, dict) and isinstance(avatar.get("gravatar"), dict):
        avatar_hash = avatar["gravatar"].get("hash")
        if avatar_hash:
            user.tmdb_avatar_hash = avatar_hash
            user.save(update_fields=("tmdb_avatar_hash",))


def user_integrations_payload(user: User) -> dict:
    """Body for GET /auth/me/integrations (MeIntegrationsResponse)."""
    return {
        "steam_id": user.steam_id,
        "plex_id": user.plex_id,
        "tmdb_account_id": user.tmdb_account_id,
        "tmdb_username": user.tmdb_username,
        "tmdb_avatar_url": _gravatar_url(user.tmdb_avatar_hash),
        "tmdb_rating_sync_direction": user.tmdb_rating_sync_direction,
        "google_id": user.google_id,
        "google_email": user.google_email,
        "google_name": user.google_name,
        "google_avatar_url": clean_image_url(user.google_avatar_url),
        "drive_connected": user.drive_refresh_token is not None,
        "plex_watch_history_enabled": user.plex_watch_history_enabled,
    }


def oauth_providers_payload(user: User) -> list[dict]:
    """Five-provider list body for GET /auth/oauth (IntegrationsResponse).

    Local user columns only — never Steam/TMDB HTTP. Live player summaries
    and TMDb tallies belong on dedicated refresh endpoints, not page load.
    """
    tmdb_avatar_url = _gravatar_url(user.tmdb_avatar_hash)

    def row(overrides: dict) -> dict:
        fields = {
            "name": None,
            "connected": False,
            "steam_id": None,
            "steam_profile": None,
            "plex_id": None,
            "plex_username": None,
            "plex_email": None,
            "plex_thumb": None,
            "tmdb_username": None,
            "tmdb_avatar_url": None,
            "tmdb_stats": None,
            "tmdb_rating_sync_direction": None,
            "google_email": None,
            "google_name": None,
            "google_avatar_url": None,
            "epic_account_id": None,
            "epic_display_name": None,
            "gog_account_id": None,
            "gog_display_name": None,
        }
        fields.update(overrides)
        return fields

    return [
        row(
            {
                "name": "steam",
                "connected": user.steam_id is not None,
                "steam_id": user.steam_id,
                "steam_profile": None,
            }
        ),
        row(
            {
                "name": "plex",
                "connected": user.plex_id is not None,
                "plex_id": user.plex_id,
                "plex_username": user.plex_username,
                "plex_email": user.plex_email,
                "plex_thumb": user.plex_thumb,
            }
        ),
        row(
            {
                "name": "tmdb",
                "connected": user.tmdb_session_id is not None,
                "tmdb_username": user.tmdb_username,
                "tmdb_avatar_url": tmdb_avatar_url,
                "tmdb_stats": None,
                "tmdb_rating_sync_direction": user.tmdb_rating_sync_direction,
            }
        ),
        row(
            {
                "name": "google",
                "connected": user.google_id is not None,
                "google_email": user.google_email,
                "google_name": user.google_name,
                "google_avatar_url": clean_image_url(user.google_avatar_url),
            }
        ),
        row(
            {
                "name": "google_drive",
                "connected": user.drive_refresh_token is not None,
            }
        ),
        row(
            {
                "name": "epic",
                "connected": user.epic_refresh_token is not None,
                "epic_account_id": user.epic_account_id,
                "epic_display_name": user.epic_display_name,
            }
        ),
        row(
            {
                "name": "gog",
                "connected": user.gog_refresh_token is not None,
                "gog_account_id": user.gog_account_id,
                "gog_display_name": user.gog_display_name,
            }
        ),
    ]


def frontend_base() -> str:
    """Public accessor for the configured frontend origin (redirect targets)."""
    return _frontend_base()


# ── Epic link (login URL only; token exchange lives on the Otix Server) ──

EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"
EPIC_OAUTH_FLOW = "epic-link"


def build_epic_link_url(*, user_id: int) -> tuple[str, str]:
    """Epic link initiate -> ``(auth_url, state)``. No Epic HTTP from Django."""
    state = secrets.token_urlsafe(32)
    OAuthState.objects.create(
        key=state, payload={"v": "1", "flow": EPIC_OAUTH_FLOW, "user_id": user_id}
    )
    redirect = (
        f"https://www.epicgames.com/id/api/redirect?clientId={EPIC_CLIENT_ID}&responseType=code"
    )
    auth_url = "https://www.epicgames.com/id/login?redirectUrl=" + urllib.parse.quote(
        redirect, safe=""
    )
    return auth_url, state


def consume_epic_link_state(state: str, *, user_id: int) -> dict | None:
    """Read+delete an epic-link state; ``None`` when absent, expired, or mismatched."""
    payload = _consume_state(state)
    if payload is None:
        return None
    if payload.get("flow") != EPIC_OAUTH_FLOW:
        return None
    if payload.get("user_id") != user_id:
        return None
    return payload


def delete_epic_link_states(*, user_id: int) -> None:
    """Clean up any remaining epic-link OAuthState rows for the given user."""
    for row in OAuthState.objects.filter(payload__flow=EPIC_OAUTH_FLOW):
        if row.payload.get("user_id") == user_id:
            row.delete()


# ── GOG link (login URL only; token exchange lives on the Otix Server / client) ──

GOG_CLIENT_ID = "46899977096215655"
GOG_OAUTH_FLOW = "gog-link"
GOG_REDIRECT_URI = "https://embed.gog.com/on_login_success?origin=client"


def build_gog_link_url(*, user_id: int) -> tuple[str, str]:
    """GOG link initiate -> ``(auth_url, state)``."""
    state = secrets.token_urlsafe(32)
    OAuthState.objects.create(
        key=state, payload={"v": "1", "flow": GOG_OAUTH_FLOW, "user_id": user_id}
    )
    auth_url = (
        f"https://auth.gog.com/auth?client_id={GOG_CLIENT_ID}"
        f"&redirect_uri={urllib.parse.quote(GOG_REDIRECT_URI, safe='')}"
        f"&response_type=code&layout=client2"
    )
    return auth_url, state


def consume_gog_link_state(state: str, *, user_id: int) -> dict | None:
    """Read+delete a gog-link state; ``None`` when absent, expired, or mismatched."""
    payload = _consume_state(state)
    if payload is None:
        return None
    if payload.get("flow") != GOG_OAUTH_FLOW:
        return None
    if payload.get("user_id") != user_id:
        return None
    return payload


def delete_gog_link_states(*, user_id: int) -> None:
    """Clean up any remaining gog-link OAuthState rows for the given user."""
    for row in OAuthState.objects.filter(payload__flow=GOG_OAUTH_FLOW):
        if row.payload.get("user_id") == user_id:
            row.delete()
