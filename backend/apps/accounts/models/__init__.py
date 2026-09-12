"""Accounts domain models.

Follows the models-package convention: one module per aggregate/concern, with
all public model classes re-exported here so app code writes
``from apps.accounts.models import User``.
"""

from apps.accounts.models.managers import UserManager
from apps.accounts.models.oauth import OAUTH_STATE_TTL_SECONDS, OAuthState
from apps.accounts.models.security import (
    ACTION_TOKEN_HOURS,
    PURPOSE_CHOICES,
    PURPOSE_PASSWORD_RESET,
    PURPOSE_VERIFY_EMAIL,
    REFRESH_TOKEN_DAYS,
    AuthActionToken,
    RefreshToken,
    UserSession,
)
from apps.accounts.models.user import User

__all__ = [
    "ACTION_TOKEN_HOURS",
    "OAUTH_STATE_TTL_SECONDS",
    "OAuthState",
    "PURPOSE_CHOICES",
    "PURPOSE_PASSWORD_RESET",
    "PURPOSE_VERIFY_EMAIL",
    "REFRESH_TOKEN_DAYS",
    "AuthActionToken",
    "RefreshToken",
    "User",
    "UserManager",
    "UserSession",
]
