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


def _consume_state(state: str) -> dict | None:
    """Atomically read+delete one state; ``None`` when absent or expired."""
    try:
        row = OAuthState.objects.get(key=state)
    except OAuthState.DoesNotExist:
        return None
    row.delete()  # single-use regardless of expiry outcome
    age = timezone.now() - row.created_at
    if age > timedelta(seconds=OAUTH_STATE_TTL_SECONDS):
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
