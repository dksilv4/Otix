"""Accounts API views, re-exported for convenient imports."""

from apps.accounts.views.auth import MePreferencesView, MeView, RegisterView
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
from apps.accounts.views.oauth import (
    GoogleDisconnectView,
    GoogleDriveDisconnectView,
    GoogleDriveLinkCallbackView,
    GoogleDriveLinkInitiateView,
    GoogleLinkCallbackView,
    GoogleLinkInitiateView,
    GoogleLinkTokenView,
)
from apps.accounts.views.user_continue import ContinueWatchingView
from apps.accounts.views.user_profile import UserDetailView, UserSearchView

__all__ = [
    "ContinueWatchingView",
    "ForgotPasswordView",
    "GoogleDisconnectView",
    "GoogleDriveDisconnectView",
    "GoogleDriveLinkCallbackView",
    "GoogleDriveLinkInitiateView",
    "GoogleLinkCallbackView",
    "GoogleLinkInitiateView",
    "GoogleLinkTokenView",
    "LoginView",
    "LogoutView",
    "MePreferencesView",
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
