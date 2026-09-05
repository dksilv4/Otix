"""Account/auth routes.

Mounted at ``/api/v1/auth/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
precede any parameterised sibling.
"""

from django.urls import path

from apps.accounts.views import (
    ForgotPasswordView,
    GoogleDisconnectView,
    GoogleDriveDisconnectView,
    GoogleDriveLinkCallbackView,
    GoogleDriveLinkInitiateView,
    GoogleLinkCallbackView,
    GoogleLinkInitiateView,
    GoogleLinkTokenView,
    LoginView,
    LogoutView,
    MePreferencesView,
    MeView,
    RefreshView,
    RegisterView,
    ResetPasswordView,
    SessionDetailView,
    SessionsView,
    TwoFactorDisableView,
    TwoFactorEnableView,
    TwoFactorLoginVerifyView,
    TwoFactorSetupView,
    VerifyEmailSendView,
    VerifyEmailView,
)

app_name = "accounts"

urlpatterns = [
    path("register", RegisterView.as_view(), name="register"),
    path("login", LoginView.as_view(), name="login"),
    path("refresh", RefreshView.as_view(), name="refresh"),
    path("logout", LogoutView.as_view(), name="logout"),
    path("forgot-password", ForgotPasswordView.as_view(), name="forgot-password"),
    path("reset-password", ResetPasswordView.as_view(), name="reset-password"),
    path("verify-email/send", VerifyEmailSendView.as_view(), name="verify-email-send"),
    path("verify-email", VerifyEmailView.as_view(), name="verify-email"),
    path("2fa/setup", TwoFactorSetupView.as_view(), name="2fa-setup"),
    path("2fa/enable", TwoFactorEnableView.as_view(), name="2fa-enable"),
    path("2fa/disable", TwoFactorDisableView.as_view(), name="2fa-disable"),
    path("2fa/login/verify", TwoFactorLoginVerifyView.as_view(), name="2fa-login-verify"),
    path("sessions", SessionsView.as_view(), name="sessions"),
    path(
        "sessions/<str:session_key>",
        SessionDetailView.as_view(),
        name="session-detail",
    ),
    path("me/preferences", MePreferencesView.as_view(), name="me-preferences"),
    path("me", MeView.as_view(), name="me"),
    # OAuth link surface (google + google-drive). Login families mount under
    # /auth/{provider}/ later; google/google-drive disconnect live here.
    path("oauth/google", GoogleLinkInitiateView.as_view(), name="oauth-google"),
    path(
        "oauth/google/callback",
        GoogleLinkCallbackView.as_view(),
        name="oauth-google-callback",
    ),
    path("oauth/google/token", GoogleLinkTokenView.as_view(), name="oauth-google-token"),
    path(
        "oauth/google/disconnect",
        GoogleDisconnectView.as_view(),
        name="oauth-google-disconnect",
    ),
    path(
        "oauth/google-drive",
        GoogleDriveLinkInitiateView.as_view(),
        name="oauth-google-drive",
    ),
    path(
        "oauth/google-drive/callback",
        GoogleDriveLinkCallbackView.as_view(),
        name="oauth-google-drive-callback",
    ),
    path(
        "oauth/google-drive/disconnect",
        GoogleDriveDisconnectView.as_view(),
        name="oauth-google-drive-disconnect",
    ),
]
