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
MAX_BACKGROUND_URL_LENGTH = 2048
MAX_COUNTRY_LENGTH = 100

# New-account defaults mirroring the legacy ``User`` column server defaults.
DEFAULT_PROFILE_SECTIONS = [
    "hof_movie",
    "hof_show",
    "hof_game",
    "hof_music",
    "library_breakdown",
    "mood_timeline",
]
DEFAULT_PROFILE_CARD_SECTIONS = ["reviews", "stats", "top_rated", "recent_activity"]
DEFAULT_PREFERRED_MEDIA_TYPES = ["movie", "show", "game", "music"]


# Importable defaults (migrations can only serialise dotted paths, not lambdas).
def default_profile_sections() -> list[str]:
    return list(DEFAULT_PROFILE_SECTIONS)


def default_profile_card_sections() -> list[str]:
    return list(DEFAULT_PROFILE_CARD_SECTIONS)


def default_preferred_media_types() -> list[str]:
    return list(DEFAULT_PREFERRED_MEDIA_TYPES)


class User(TimestampedModel, AbstractBaseUser, PermissionsMixin):
    """A platform account.

    ``username`` is the stable login handle; ``email`` is optional but, when
    present, unique. External identity columns (``google_id``, ``plex_id``,
    ``steam_id``, ``tmdb_session_id``/``tmdb_account_id``) are unique where set
    so each provider identity maps to at most one user.
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

    # --- TMDb integration profile (request_token -> session_id dance; no OAuth) ---
    # Legacy ``User`` carries no plain ``tmdb_id`` — the account is identified by
    # the validated session + the TMDb account id fetched from it. ``tmdb_id``
    # (0001 placeholder) was replaced by this set in 0006.
    tmdb_session_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    tmdb_account_id = models.BigIntegerField(null=True, blank=True, unique=True)
    tmdb_username = models.CharField(max_length=150, null=True, blank=True)
    tmdb_avatar_hash = models.CharField(max_length=64, null=True, blank=True)
    tmdb_rating_sync_direction = models.CharField(
        max_length=16, default="disabled", null=False, blank=False
    )

    # --- Google / Google-Drive integration tokens + profile ---
    # Populated by the /auth/oauth/google(+drive) link + callback flows; a null
    # google_id / drive_refresh_token respectively marks the account as not
    # linked. Token columns mirror the legacy ``User`` row column-for-column
    # (``backend/otix/domain/user.py``).
    google_email = models.CharField(max_length=MAX_EMAIL_LENGTH, null=True, blank=True)
    google_name = models.CharField(max_length=MAX_DISPLAY_NAME_LENGTH, null=True, blank=True)
    google_avatar_url = models.CharField(
        max_length=MAX_AVATAR_URL_LENGTH, null=True, blank=True
    )
    google_access_token = models.TextField(null=True, blank=True)
    google_refresh_token = models.TextField(null=True, blank=True)
    google_token_expires_at = models.DateTimeField(null=True, blank=True)
    drive_access_token = models.TextField(null=True, blank=True)
    drive_refresh_token = models.TextField(null=True, blank=True)
    drive_token_expires_at = models.DateTimeField(null=True, blank=True)

    # --- Plex integration profile (PIN auth is public; no token expiry) ---
    plex_username = models.CharField(
        max_length=MAX_DISPLAY_NAME_LENGTH, null=True, blank=True
    )
    plex_email = models.CharField(max_length=MAX_EMAIL_LENGTH, null=True, blank=True)
    plex_thumb = models.CharField(max_length=MAX_AVATAR_URL_LENGTH, null=True, blank=True)
    plex_auth_token = models.TextField(null=True, blank=True)
    plex_watch_history_enabled = models.BooleanField(default=False)

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

    # --- Profile & preferences ---
    # Column set/defaults mirror the legacy ``User`` row (``backend/otix/
    # domain/user.py``). Integration-specific token columns (plex_*/tmdb_*/
    # google_*/drive_*) land with their OAuth slices, and the pgvector
    # ``embedding`` stays deferred (sqlite-safe schema).
    bio = models.TextField(null=True, blank=True)
    background_url = models.URLField(
        max_length=MAX_BACKGROUND_URL_LENGTH, null=True, blank=True
    )
    date_of_birth = models.DateField(null=True, blank=True)
    country = models.CharField(max_length=MAX_COUNTRY_LENGTH, null=True, blank=True)
    is_private = models.BooleanField(default=False)
    show_adult_content = models.BooleanField(default=False)
    is_bot = models.BooleanField(default=False)
    total_xp = models.BigIntegerField(default=0)
    daily_mood_checkins_enabled = models.BooleanField(default=True)
    onboarding_completed = models.BooleanField(default=False)
    integration_visibility = models.JSONField(default=dict, blank=True)
    profile_sections = models.JSONField(
        default=default_profile_sections, blank=True
    )
    profile_card_sections = models.JSONField(
        default=default_profile_card_sections, blank=True
    )
    hall_of_fame_media_ids = models.JSONField(default=dict, blank=True)
    notification_preferences = models.JSONField(default=dict, blank=True)
    preferred_media_types = models.JSONField(
        default=default_preferred_media_types, blank=True
    )
    preferred_genres = models.JSONField(default=list, blank=True)
    preferred_languages = models.JSONField(default=list, blank=True)
    discover_emphases = models.JSONField(default=list, blank=True)

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
