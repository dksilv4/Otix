"""Google / Google-Drive OAuth link + token service.

Port of the legacy link-only family (``backend/otix/api/auth/oauth/google*``
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

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

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

GOOGLE_OAUTH_FLOW = "youtube"  # google link scopes are the youtube+identity set
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
    headers: dict | None = None,
    timeout: float = 15.0,
) -> tuple[int, str]:
    """Return ``(status, body_text)``; raises ``OAuthProviderError`` on network failure."""
    payload = None
    if form is not None:
        payload = urllib.parse.urlencode(form).encode("ascii")
        headers = dict(headers or {})
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
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


# ── Single-use state ──────────────────────────────────────────────────────

def _store_state(flow: str, *, user_id: int | None) -> tuple[str, str]:
    """Persist one flow state; returns the ``state`` value + PKCE verifier."""
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    payload: dict[str, Any] = {"v": "1", "flow": flow, "verifier": verifier}
    if user_id is not None:
        payload["user_id"] = user_id
    OAuthState.objects.create(key=state, payload=payload)
    return state, verifier


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


def _authorization_url(flow: str, provider: str, *, user_id: int) -> tuple[str, str]:
    client_id, _ = _google_credentials()
    state, verifier = _store_state(flow, user_id=user_id)
    scopes = YOUTUBE_SCOPES if flow == GOOGLE_OAUTH_FLOW else DRIVE_SCOPES
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": _callback_url(provider),
        "state": state,
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge": _s256(verifier),
        "code_challenge_method": "S256",
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}", state


def build_google_link_url(user_id: int) -> tuple[str, str]:
    """Google (youtube-identity scope) link initiate -> ``{auth_url, state}``."""
    _require_google_configured("Google authentication is not configured.")
    return _authorization_url(GOOGLE_OAUTH_FLOW, "google", user_id=user_id)


def build_google_drive_link_url(user_id: int) -> tuple[str, str]:
    """Google-Drive link initiate (drive.file scope) -> ``{auth_url, state}``."""
    _require_google_configured("Google authentication not configured.")
    return _authorization_url(DRIVE_OAUTH_FLOW, "google-drive", user_id=user_id)


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


def _exchange_code(code: str, verifier: str, provider: str) -> dict:
    client_id, client_secret = _google_credentials()
    try:
        status, raw = _request(
            GOOGLE_TOKEN_URL,
            method="POST",
            form={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _callback_url(provider),
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


def link_google_to_user(request_user, code: str, state: str) -> None:
    """Consume the link state and bind Google to the owning user."""
    _require_google_configured("Google authentication is not configured.")
    payload = _consume_state(state)
    if payload is None:
        raise OAuthFlowError(400, "Google linking session expired. Please try again.")
    user = _resolve_callback_user(payload, request_user)
    if user.google_id:
        raise OAuthFlowError(400, "Google account already linked")
    tokens = _exchange_code(code, payload.get("verifier", ""), "google")
    profile = _fetch_google_profile(tokens["access_token"])
    if (
        User.objects.filter(google_id=profile["sub"]).exclude(pk=user.pk).exists()
    ):
        raise OAuthFlowError(
            409, "This Google account is already linked to another Otix account."
        )
    user.google_id = profile["sub"]
    user.google_email = profile.get("email")
    user.google_name = profile.get("name")
    user.google_avatar_url = profile.get("picture")
    user.google_access_token = tokens.get("access_token")
    user.google_refresh_token = tokens.get("refresh_token")
    user.google_token_expires_at = _expiry_from(tokens)
    user.save(update_fields=_GOOGLE_TOKEN_COLUMNS)


def link_google_drive_to_user(request_user, code: str, state: str) -> None:
    """Consume the link state and bind Google-Drive to the owning user.

    Drive has no profile fetch and no duplicate/revoke guard: the refresh token
    alone marks the connection.
    """
    _require_google_configured("Google authentication not configured.")
    payload = _consume_state(state)
    if payload is None:
        raise OAuthFlowError(400, "Google linking session expired. Please try again.")
    user = _resolve_callback_user(payload, request_user)
    tokens = _exchange_code(code, payload.get("verifier", ""), "google-drive")
    user.drive_access_token = tokens.get("access_token")
    user.drive_refresh_token = tokens.get("refresh_token")
    user.drive_token_expires_at = _expiry_from(tokens)
    user.save(update_fields=_DRIVE_TOKEN_COLUMNS)


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
    if status != 200:
        raise OAuthFlowError(502, start_error)
    body = _parse_json(raw)
    pin_id = body.get("id")
    code = body.get("code")
    if not pin_id or not code:
        raise OAuthFlowError(502, invalid_error)
    return str(pin_id), str(code)


def _plex_auth_url(code: str, state: str, callback: str) -> str:
    forward_url = f"{callback}?{urllib.parse.urlencode({'state': state})}"
    params = {
        "clientID": getattr(settings, "PLEX_CLIENT_IDENTIFIER", "otix-web"),
        "code": code,
        "forwardUrl": forward_url,
        "context[device][product]": getattr(settings, "PLEX_PRODUCT", "Otix"),
        "context[device][version]": getattr(settings, "PLEX_VERSION", "0.1.0"),
    }
    return f"{_plex_auth_base()}#?{urllib.parse.urlencode(params)}"


def build_plex_link_url(user_id: int) -> tuple[str, str, str]:
    """Plex link initiate -> ``(auth_url, state, pin_id)``."""
    pin_id, code = _create_plex_pin(
        "Unable to start Plex linking. Please try again.",
        "Plex returned an invalid linking response. Please try again.",
    )
    state = secrets.token_urlsafe(32)
    OAuthState.objects.create(
        key=state, payload={"v": "1", "pin_id": pin_id, "user_id": user_id}
    )
    callback = f"{_frontend_base()}/auth/plex/connect/callback"
    return _plex_auth_url(code, state, callback), state, pin_id


def build_plex_login_url() -> tuple[str, str, str]:
    """Plex login initiate (no owning user) -> ``(auth_url, state, pin_id)``."""
    pin_id, code = _create_plex_pin(
        "Unable to start Plex login. Please try again.",
        "Plex returned an invalid response. Please try again.",
    )
    state = secrets.token_urlsafe(32)
    OAuthState.objects.create(
        key=state, payload={"v": "1", "pin_id": pin_id, "flow": "login"}
    )
    callback = f"{_frontend_base()}/auth/callback/plex-login"
    return _plex_auth_url(code, state, callback), state, pin_id


def _get_plex_pin_auth_token(pin_id: str) -> str | None:
    """One-shot poll of the PIN; ``None`` when Plex has not yet approved it."""
    try:
        status, raw = _request(
            f"{_plex_tv_base()}/api/v2/pins/{pin_id}", headers=_plex_headers()
        )
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


def link_plex_to_user(request_user, state: str, pin_id: str | None) -> None:
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
        raise OAuthFlowError(
            400, "Plex has not approved this link yet. Please finish signing in."
        )
    profile = _get_plex_user_info(token)
    plex_id = _plex_identity(profile)
    if User.objects.filter(plex_id=plex_id).exclude(pk=user.pk).exists():
        raise OAuthFlowError(
            409, "This Plex account is already linked to another Otix account."
        )
    user.plex_id = plex_id
    user.plex_username = profile.get("username") or profile.get("title")
    user.plex_email = profile.get("email")
    user.plex_thumb = profile.get("thumb")
    user.plex_auth_token = token
    user.save(update_fields=_PLEX_TOKEN_COLUMNS)


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
        avatar_url=thumb,
        plex_id=plex_id,
        plex_username=username,
        plex_email=email,
        plex_thumb=thumb,
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
    return find_or_create_plex_user(
        plex_id,
        username=profile.get("username") or profile.get("title"),
        email=profile.get("email"),
        thumb=profile.get("thumb"),
        auth_token=token,
    )
