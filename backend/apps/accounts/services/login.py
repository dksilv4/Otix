"""Password-identity resolution for ``POST /auth/login``.

Identity is tried first as email, then as username (legacy order). Any failure
(unknown user, inactive account, wrong password) collapses into a single
``None`` so the route answers one uniform ``Invalid email or password``.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model

User = get_user_model()


def resolve_user(identity: str):
    """First email match, else username match; no password check."""
    user = User.objects.filter(email__iexact=identity).first()
    if user is None:
        user = User.objects.filter(username=identity).first()
    return user


def authenticate_identity(identity: str, password: str):
    """Return the active user if ``identity``+``password`` match, else None."""
    user = resolve_user(identity)
    if user is None or not user.is_active or not user.check_password(password):
        return None
    return user
