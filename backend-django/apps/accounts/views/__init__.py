"""Accounts API views, re-exported for convenient imports."""

from apps.accounts.views.auth import MeView, RegisterView
from apps.accounts.views.auth_recovery import (
    ForgotPasswordView,
    ResetPasswordView,
    TwoFactorDisableView,
    TwoFactorEnableView,
    TwoFactorLoginVerifyView,
    TwoFactorSetupView,
    VerifyEmailSendView,
    VerifyEmailView,
)
from apps.accounts.views.auth_session import (
    LoginView,
    LogoutView,
    RefreshView,
    SessionDetailView,
    SessionsView,
)
from apps.accounts.views.user_continue import ContinueWatchingView
from apps.accounts.views.user_profile import UserDetailView, UserSearchView

__all__ = [
    "ContinueWatchingView",
    "ForgotPasswordView",
    "LoginView",
    "LogoutView",
    "MeView",
    "RefreshView",
    "RegisterView",
    "ResetPasswordView",
    "SessionDetailView",
    "SessionsView",
    "TwoFactorDisableView",
    "TwoFactorEnableView",
    "TwoFactorLoginVerifyView",
    "TwoFactorSetupView",
    "UserDetailView",
    "UserSearchView",
    "VerifyEmailSendView",
    "VerifyEmailView",
]
