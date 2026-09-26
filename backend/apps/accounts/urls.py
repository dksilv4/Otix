"""Account/auth routes.

Mounted at ``/api/v1/auth/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
precede any parameterised sibling.
"""

from django.urls import path

from apps.accounts.views import (
    EpicDisconnectView,
    EpicLinkCallbackView,
    EpicLinkInitiateView,
    ForgotPasswordView,
    GoogleDisconnectView,
    GoogleDriveDisconnectView,
    GoogleDriveLinkCallbackView,
    GoogleDriveLinkInitiateView,
    GoogleLinkCallbackView,
    GoogleLinkInitiateView,
    GoogleLinkTokenView,
    GoogleLoginCallbackView,
    GoogleLoginInitiateView,
    LoginView,
    LogoutView,
    MeIntegrationsView,
    MePreferencesView,
    MeTasteResetView,
    MeView,
    OAuthProvidersView,
    PlexDisconnectView,
    PlexLinkCallbackView,
    PlexLinkInitiateView,
    PlexLoginCallbackView,
    PlexLoginInitiateView,
    RefreshView,
    RegisterView,
    ResetPasswordView,
    SessionDetailView,
    SessionsView,
    SteamDisconnectView,
    SteamLinkCallbackView,
    SteamLinkInitiateView,
    SteamLoginCallbackView,
    SteamLoginInitiateView,
    TMDbDisconnectView,
    TMDbLinkCallbackView,
    TMDbLinkInitiateView,
    TMDbLinkRedirectView,
    TMDbLoginCallbackView,
    TMDbLoginInitiateView,
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
    path("me/integrations", MeIntegrationsView.as_view(), name="me-integrations"),
    path("me/taste/reset", MeTasteResetView.as_view(), name="me-taste-reset"),
    path("me", MeView.as_view(), name="me"),
    # OAuth aggregate: five-provider linked status.
    path("oauth", OAuthProvidersView.as_view(), name="oauth-providers"),
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
    path("oauth/plex", PlexLinkInitiateView.as_view(), name="oauth-plex"),
    path("oauth/plex/callback", PlexLinkCallbackView.as_view(), name="oauth-plex-callback"),
    path("oauth/plex/disconnect", PlexDisconnectView.as_view(), name="oauth-plex-disconnect"),
    # Steam link surface.
    path("oauth/steam", SteamLinkInitiateView.as_view(), name="oauth-steam"),
    path("oauth/steam/callback", SteamLinkCallbackView.as_view(), name="oauth-steam-callback"),
    path("oauth/steam/disconnect", SteamDisconnectView.as_view(), name="oauth-steam-disconnect"),
    # Epic link surface (node-proxied; no User columns, not a login provider).
    path("oauth/epic", EpicLinkInitiateView.as_view(), name="oauth-epic"),
    path("oauth/epic/callback", EpicLinkCallbackView.as_view(), name="oauth-epic-callback"),
    path(
        "oauth/epic/disconnect",
        EpicDisconnectView.as_view(),
        name="oauth-epic-disconnect",
    ),
    # TMDb link surface (connect).
    path("oauth/tmdb", TMDbLinkInitiateView.as_view(), name="oauth-tmdb"),
    path("oauth/tmdb/callback", TMDbLinkCallbackView.as_view(), name="oauth-tmdb-callback"),
    path("oauth/tmdb/disconnect", TMDbDisconnectView.as_view(), name="oauth-tmdb-disconnect"),
    path("oauth/tmdb/redirect", TMDbLinkRedirectView.as_view(), name="oauth-tmdb-redirect"),
    # Plex login family (unauthed; no owning Otix user at initiate).
    path("plex/initiate", PlexLoginInitiateView.as_view(), name="plex-login-initiate"),
    path("plex/callback", PlexLoginCallbackView.as_view(), name="plex-login-callback"),
    # Google login family (unauthed; no owning Otix user at initiate).
    path("google/initiate", GoogleLoginInitiateView.as_view(), name="google-login-initiate"),
    path("google/callback", GoogleLoginCallbackView.as_view(), name="google-login-callback"),
    # Steam login family (unauthed; no owning Otix user at initiate).
    path("steam/initiate", SteamLoginInitiateView.as_view(), name="steam-login-initiate"),
    path("steam/callback", SteamLoginCallbackView.as_view(), name="steam-login-callback"),
    # TMDb login family (unauthed; no owning Otix user at initiate).
    path("tmdb/initiate", TMDbLoginInitiateView.as_view(), name="tmdb-login-initiate"),
    path("tmdb/callback", TMDbLoginCallbackView.as_view(), name="tmdb-login-callback"),
]
