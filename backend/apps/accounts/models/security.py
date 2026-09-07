"""Session, refresh-token and one-time action-token tables.

Mirrors the legacy FastAPI auth runtime tables (``user_sessions``,
``refresh_tokens``, ``auth_action_tokens`` in ``backend/otix/domain/``). All
three are keyed to ``settings.AUTH_USER_MODEL`` and carry the shared
``created_at``/``updated_at`` timestamps from ``core.models.TimestampedModel``.

Design notes (recorded in ARCHITECTURE §6):

- A **session** is one ``UserSession`` row (``session_key`` = uuid4). A fresh
  row is created on every successful password / 2FA / OAuth login.
- A **refresh token** is one ``RefreshToken`` row, minted per rotation; its
  ``jti`` rides in the refresh-JWT claim. Rotation revokes the previous row;
  presenting a revoked ``jti`` revokes *all* the user's tokens.
- An **action token** covers email-verify and password-reset links: the raw
  token is emailed, only its sha-256 hash is stored, and each row is
  single-use with a 24 h expiry.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

# Legacy table names are reproduced verbatim (ARCHITECTURE §9 db_table rule).
REFRESH_TOKEN_DAYS = 7
ACTION_TOKEN_HOURS = 24

PURPOSE_VERIFY_EMAIL = "verify_email"
PURPOSE_PASSWORD_RESET = "password_reset"
PURPOSE_CHOICES = [
    (PURPOSE_VERIFY_EMAIL, "Email verification"),
    (PURPOSE_PASSWORD_RESET, "Password reset"),
]


class UserSession(TimestampedModel):
    """A single login session: the unit the ``/auth/sessions`` UI lists."""

    db_table = "user_sessions"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_key = models.CharField(max_length=36, unique=True)
    ip_address = models.CharField(max_length=45, null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=50, null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        ordering = ("-last_seen_at", "-created_at")

    def __str__(self) -> str:
        return f"{self.user_id} {self.session_key}"


class RefreshToken(TimestampedModel):
    """One issued refresh JWT; rotation revokes the row that was just used."""

    db_table = "refresh_tokens"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
    )
    jti = models.CharField(max_length=36, unique=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.user_id} {self.jti}"


class AuthActionToken(TimestampedModel):
    """Single-use emailed token for email-verify / password-reset."""

    db_table = "auth_action_tokens"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="action_tokens",
    )
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    token_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("user", "purpose"), name="action_token_user_purpose"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.purpose}"
