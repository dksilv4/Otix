"""Custom user model.

Mirrors the meaningful subset of the legacy FastAPI ``User``
(``backend/otix/domain/user.py``). The legacy table carries a long tail of
profile/tuning columns and pgvector embeddings; those arrive incrementally as
their features are ported, not up front. This slice captures identity + auth
fields plus the nullable external identities the platform keys on.

References to the user model anywhere in the codebase must use
``settings.AUTH_USER_MODEL`` as a string (never a hard import).
"""

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from apps.accounts.models.managers import UserManager
from core.models import TimestampedModel

MAX_EMAIL_LENGTH = 320
MAX_USERNAME_LENGTH = 150
MAX_DISPLAY_NAME_LENGTH = 150
MAX_AVATAR_URL_LENGTH = 2048
MAX_EXTERNAL_ID_LENGTH = 64


class User(TimestampedModel, AbstractBaseUser, PermissionsMixin):
    """A platform account.

    ``username`` is the stable login handle; ``email`` is optional but, when
    present, unique. External identity columns (``google_id``, ``plex_id``,
    ``steam_id``, ``tmdb_id``) are unique where set so each provider identity
    maps to at most one user.
    """

    username = models.CharField(
        max_length=MAX_USERNAME_LENGTH,
        unique=True,
        db_index=True,
        help_text="Required. Login handle. Unique.",
    )
    email = models.EmailField(
        max_length=MAX_EMAIL_LENGTH,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional. Unique when set.",
    )
    display_name = models.CharField(
        max_length=MAX_DISPLAY_NAME_LENGTH,
        blank=True,
        default="",
        help_text="Public display name; falls back to username when empty.",
    )
    avatar_url = models.URLField(
        max_length=MAX_AVATAR_URL_LENGTH,
        null=True,
        blank=True,
        help_text="Absolute URL of the avatar image.",
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    # is_superuser, groups, user_permissions come from PermissionsMixin.

    # --- External identities (unique where set) ---
    google_id = models.CharField(
        max_length=MAX_EXTERNAL_ID_LENGTH, null=True, blank=True, unique=True, db_index=True
    )
    plex_id = models.CharField(
        max_length=MAX_EXTERNAL_ID_LENGTH, null=True, blank=True, unique=True, db_index=True
    )
    steam_id = models.CharField(
        max_length=17, null=True, blank=True, unique=True, db_index=True
    )
    tmdb_id = models.CharField(
        max_length=MAX_EXTERNAL_ID_LENGTH, null=True, blank=True, unique=True, db_index=True
    )

    # --- Security ---
    two_factor_enabled = models.BooleanField(default=False)
    # base32 TOTP secret. Populated by /auth/2fa/setup *before* enable; kept
    # after enable so the same secret stays valid; cleared by disable.
    two_factor_secret = models.CharField(max_length=64, null=True, blank=True)
    is_verified = models.BooleanField(
        default=False,
        help_text="True once the account email has been verified.",
    )
    # Epoch marker for /auth/logout and password reset: any refresh token whose
    # ``iat`` predates this is rejected, killing every session at once.
    global_logout_marker = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []  # email is optional; createsuperuser asks only for username+password

    class Meta(TimestampedModel.Meta):
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self) -> str:
        return self.username

    @property
    def resolved_display_name(self) -> str:
        """Public name: explicit display_name, else the username handle."""
        return self.display_name or self.username
