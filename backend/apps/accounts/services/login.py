"""Password-identity resolution for ``POST /auth/login``.

Identity is tried first as email, then as username (legacy order). Any failure
(unknown user, inactive account, wrong password) collapses into a single
``None`` so the route answers one uniform ``Invalid email or password``.
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)

User = get_user_model()


def resolve_user(identity: str):
    """First email match, else username match; no password check."""
    cleaned = (identity or "").strip()
    user = User.objects.filter(email__iexact=cleaned).first()
    if user is None:
        user = User.objects.filter(username__iexact=cleaned).first()
    return user


def authenticate_identity(identity: str, password: str):
    """Return the active user if ``identity``+``password`` match, else None."""
    user = resolve_user(identity)
    if user is None:
        logger.warning("Login failed: no user resolved for identity %r", identity)
        return None
    if not user.is_active:
        logger.warning("Login failed: user %r is not active", user.username)
        return None
    if not user.check_password(password):
        logger.warning("Login failed: password mismatch for user %r", user.username)
        return None
    return user
