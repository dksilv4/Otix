from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth.base_user import BaseUserManager

if TYPE_CHECKING:
    from apps.accounts.models.user import User


class UserManager(BaseUserManager):
    """Manager for :class:`apps.accounts.models.User`.

    ``username`` is the immutable login field; ``email`` is optional. External
    identity lookups (google_id/plex_id/steam_id/tmdb_id) get dedicated helpers
    once the auth task needs them.
    """

    use_in_migrations = True

    def _create_user(
        self, username: str, email: str | None, password: str | None, **extra_fields
    ) -> User:
        if not username:
            raise ValueError("Users must have a username.")
        normalized_email = self.normalize_email(email) if email else None
        user = self.model(username=username, email=normalized_email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(
        self, username: str, email: str | None = None, password: str | None = None,
        **extra_fields,
    ) -> User:
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("is_active", True)
        return self._create_user(username, email, password, **extra_fields)

    def create_superuser(
        self, username: str, email: str | None = None, password: str | None = None,
        **extra_fields,
    ) -> User:
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(username, email, password, **extra_fields)
