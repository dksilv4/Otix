"""Django admin for the custom user.

Reuses Django's ``UserAdmin`` so the admin gets the full permission machinery;
we override fieldsets to include the account's own fields and provide custom
create/change forms so ``email`` and ``display_name`` are editable.
"""

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.utils.translation import gettext_lazy as _
from rest_framework.authtoken.admin import TokenAdmin
from rest_framework.authtoken.models import Token

from apps.accounts.models import AuthActionToken, RefreshToken, User, UserSession


class UserCreateForm(forms.ModelForm):
    """Create-form with two password fields; used by the add page."""

    password1 = forms.CharField(label="Password", widget=forms.PasswordInput)
    password2 = forms.CharField(
        label="Password confirmation", widget=forms.PasswordInput,
        help_text="Enter the same password as before, for verification.",
    )

    class Meta:
        model = User
        fields = ("username", "email", "display_name")

    def clean_password2(self) -> str:
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Passwords don't match.")
        return password2

    def save(self, commit: bool = True) -> User:
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class UserChangeForm(forms.ModelForm):
    """Change-form with a read-only password hash display."""

    password = ReadOnlyPasswordHashField()

    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreateForm
    list_display = ("username", "email", "is_staff", "is_active", "created_at")
    list_filter = ("is_staff", "is_superuser", "is_active", "two_factor_enabled")
    search_fields = ("username", "email", "display_name")
    ordering = ("username",)
    readonly_fields = ("created_at", "updated_at", "last_login")

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (_("Personal info"), {"fields": ("email", "display_name", "avatar_url")}),
        (
            _("External identities"),
            {
                "fields": ("google_id", "plex_id", "steam_id", "tmdb_id"),
                "classes": ("wide",),
            },
        ),
        (
            _("Permissions"),
            {
                "fields": ("is_active", "is_staff", "is_superuser", "two_factor_enabled",
                           "two_factor_secret", "is_verified", "global_logout_marker",
                           "groups", "user_permissions"),
                "classes": ("wide",),
            },
        ),
        (
            _("Important dates"),
            {"fields": ("last_login", "created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "email", "display_name", "password1", "password2"),
            },
        ),
    )


@admin.register(Token)
class OtixTokenAdmin(TokenAdmin):
    """Standard DRF token admin (read-mostly)."""


@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "jti", "created_at", "revoked_at")
    search_fields = ("jti", "user__username")
    list_filter = ("revoked_at",)


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "session_key", "last_seen_at", "revoked_at", "created_at")
    search_fields = ("session_key", "user__username")
    list_filter = ("revoked_at",)


@admin.register(AuthActionToken)
class AuthActionTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "created_at", "expires_at", "used_at")
    search_fields = ("user__username",)
    list_filter = ("purpose", "used_at")
