"""Session + refresh-token lifecycle for the auth slice.

Faithful port of the legacy ``SessionService``/``AuthService`` behaviours:

- every successful login creates a ``UserSession`` row + a ``RefreshToken`` row
  (the cookie's JWT carries ``jti`` + ``session_key`` claims);
- ``refresh_session`` rotates: the presented row is revoked and a new token
  (new jti, same session_key) is minted. Presenting an already-revoked jti is
  treated as token reuse and revokes *every* token the user owns, unless the
  reuse lands within a short grace window (concurrent client refresh race);
- ``logout`` sets ``users.global_logout_marker`` (no row revocation), which
  makes every earlier refresh token fail its next refresh — a global logout;
- revoking ``UserSession`` rows (DELETE /sessions) is cosmetic (UI list), it
  never kills a live refresh cookie, mirroring legacy.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.accounts.models import RefreshToken, User, UserSession
from apps.accounts.services.tokens import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
)

if TYPE_CHECKING:
    from django.http import HttpRequest


class AuthServiceError(Exception):
    """Raised for login/refresh failures; carries a client-facing message."""


# Overlapping /auth/refresh calls (in-flight 401s after a rotation) replay the
# old cookie within this window. Treat that as a race, not theft.
_REUSE_GRACE = timedelta(seconds=10)


def _now() -> datetime:
    return timezone.now()


def client_ip_address(request: HttpRequest | None) -> str | None:
    """First ``X-Forwarded-For`` entry (trusting the proxy) else REMOTE_ADDR."""
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45] or None
    return (request.META.get("REMOTE_ADDR") or "")[:45] or None


def create_session(
    user: User,
    request: HttpRequest | None = None,
    session_key: str | None = None,
) -> UserSession:
    """Create a fresh session row (one per successful login)."""
    if session_key is None:
        session_key = str(uuid.uuid4())
    return UserSession.objects.create(
        user=user,
        session_key=session_key,
        ip_address=client_ip_address(request),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:2000] if request else "",
        last_seen_at=_now(),
    )


def store_refresh_token(user: User, jti: str, expires_at: datetime) -> RefreshToken:
    return RefreshToken.objects.create(user=user, jti=jti, expires_at=expires_at)


def begin_session(user: User, request: HttpRequest | None = None) -> tuple[str, str]:
    """Create session + refresh row and return ``(access_token, refresh_jwt)``.

    Used by password login, 2FA verify and (later) OAuth logins.
    """
    session = create_session(user, request)
    refresh_jwt, jti, expires_at = create_refresh_token(user.pk, session.session_key)
    store_refresh_token(user, jti, expires_at)
    user.last_login = _now()
    user.save(update_fields=("last_login",))
    return create_access_token(user.pk), refresh_jwt


def _revoke_all_tokens(user: User) -> None:
    now = _now()
    RefreshToken.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=now)
    # Also stamp a global logout so tokens already in the wild fail on next use.
    if user.global_logout_marker is None or user.global_logout_marker < now:
        user.global_logout_marker = now
        user.save(update_fields=("global_logout_marker",))


def refresh_session(refresh_jwt: str, request: HttpRequest | None = None) -> tuple[str, str]:
    """Validate + rotate a refresh cookie. Returns ``(access_token, refresh_jwt)``.

    Raises :class:`AuthServiceError` for every rejection; on suspected reuse all
    of the user's refresh tokens are revoked before raising.
    """
    invalid = "Invalid or expired refresh token"
    try:
        payload = decode_token(refresh_jwt)
    except TokenError as exc:
        raise AuthServiceError(invalid) from exc

    if payload.get("type") != "refresh":
        raise AuthServiceError(invalid)

    user_id = payload.get("sub")
    jti = payload.get("jti")
    session_key = payload.get("session_key")
    if not (user_id and jti and session_key):
        raise AuthServiceError(invalid)

    user = User.objects.filter(pk=user_id).first()
    if user is None or not user.is_active:
        raise AuthServiceError(invalid)

    iat = datetime.fromtimestamp(payload["iat"], tz=UTC)
    marker = user.global_logout_marker
    if marker is not None and marker.replace(tzinfo=UTC) > iat:
        raise AuthServiceError(invalid)

    row = RefreshToken.objects.filter(jti=jti, user=user).first()
    if row is None:
        _revoke_all_tokens(user)  # unknown jti => compromised
        raise AuthServiceError(invalid)
    if row.revoked_at is not None:
        # A refresh that lands within the grace window is almost always a
        # client race (in-flight 401s after rotation), not a stolen cookie.
        revoked_at = row.revoked_at
        if revoked_at.tzinfo is None:
            revoked_at = revoked_at.replace(tzinfo=UTC)
        if _now() - revoked_at <= _REUSE_GRACE:
            raise AuthServiceError(invalid)
        _revoke_all_tokens(user)
        raise AuthServiceError(invalid)
    if row.expires_at <= _now():
        raise AuthServiceError(invalid)

    now = _now()
    row.revoked_at = now
    row.save(update_fields=("revoked_at",))
    UserSession.objects.filter(user=user, session_key=session_key).update(last_seen_at=now)

    new_refresh, new_jti, new_expires = create_refresh_token(user.pk, session_key)
    store_refresh_token(user, new_jti, new_expires)
    return create_access_token(user.pk), new_refresh


def logout(user: User) -> None:
    """Global logout: stamps the marker so every existing refresh dies."""
    now = _now()
    user.global_logout_marker = now
    user.save(update_fields=("global_logout_marker",))


def session_key_from_cookie(refresh_jwt: str | None) -> str | None:
    """Best-effort session_key from a refresh cookie (None if unparseable)."""
    if not refresh_jwt:
        return None
    try:
        payload = decode_token(refresh_jwt)
    except TokenError:
        return None
    return payload.get("session_key")


def revoke_session(user: User, session_key: str) -> None:
    """Revoke one owned, not-yet-revoked session row; raises if not found."""
    row = UserSession.objects.filter(user=user, session_key=session_key).first()
    if row is None or row.revoked_at is not None:
        raise AuthServiceError("Session not found")
    row.revoked_at = _now()
    row.revoked_reason = "user_revoked"
    row.save(update_fields=("revoked_at", "revoked_reason"))


def revoke_other_sessions(user: User, keep_session_key: str | None) -> int:
    """Revoke all session rows except ``keep_session_key``; returns the count."""
    qs = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    if keep_session_key:
        qs = qs.exclude(session_key=keep_session_key)
    count = qs.count()
    qs.update(revoked_at=_now(), revoked_reason="user_revoked")
    return count
