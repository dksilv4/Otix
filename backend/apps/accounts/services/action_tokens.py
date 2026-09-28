"""Single-use emailed action tokens (email-verify / password-reset).

The raw token is only ever emailed or embedded in a link; the DB stores its
sha-256 hash. Creating a new token for a purpose invalidates the user's prior
unused tokens of that purpose (legacy behaviour).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.utils import timezone

from apps.accounts.models import ACTION_TOKEN_HOURS, AuthActionToken, User


class ActionTokenError(Exception):
    """Raised when a consumed token is missing, used or expired."""


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_action_token(user: User, purpose: str) -> str:
    """Issue a new token for ``purpose``; returns the raw (hashed) value."""
    now = timezone.now()
    AuthActionToken.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(
        used_at=now
    )
    raw = secrets.token_urlsafe(48)
    AuthActionToken.objects.create(
        user=user,
        purpose=purpose,
        token_hash=_token_hash(raw),
        expires_at=now + timedelta(hours=ACTION_TOKEN_HOURS),
    )
    return raw


def consume_action_token(raw: str, purpose: str) -> User:
    """Validate + single-use a raw token; returns its user on success."""
    now = timezone.now()
    row = (
        AuthActionToken.objects.filter(
            purpose=purpose,
            token_hash=_token_hash(raw),
            used_at__isnull=True,
            expires_at__gt=now,
        )
        .select_related("user")
        .order_by("-created_at")
        .first()
    )
    if row is None:
        raise ActionTokenError("Invalid or expired token")
    row.used_at = now
    row.save(update_fields=("used_at",))
    return row.user
