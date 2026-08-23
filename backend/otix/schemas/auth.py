# TODO: Review this file
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=150, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    date_of_birth: date

    @model_validator(mode="after")
    def _validate(self) -> Self:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        if not re.search(r"[A-Z]", self.password):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", self.password):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", self.password):
            raise ValueError("Password must contain at least one digit")
        self.email = self.email.lower().strip()
        if self.date_of_birth:
            today = date.today()
            age = today.year - self.date_of_birth.year - (
                (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
            )
            if age < 13:
                raise ValueError("You must be at least 13 years old to register")
        return self


class LoginRequest(BaseModel):
    identity: str = Field(min_length=1, max_length=255)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterUserInfo(BaseModel):
    """User info returned on successful registration."""

    id: str
    email: str
    username: str
    is_verified: bool = False
    total_xp: int = 0
    onboarding_completed: bool = False


class RegisterResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: RegisterUserInfo


class LoginResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    two_factor_required: bool = False
    challenge_token: str | None = None


class RefreshResponse(TokenResponse):
    pass


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    is_admin: bool = False
    is_verified: bool
    two_factor_enabled: bool = False
    steam_id: str | None = None
    plex_id: str | None = None
    tmdb_account_id: int | None = None
    tmdb_username: str | None = None
    tmdb_avatar_url: str | None = None
    tmdb_rating_sync_direction: str | None = None
    google_id: str | None = None
    google_email: str | None = None
    google_name: str | None = None
    google_avatar_url: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    background_url: str | None = None
    integration_visibility: dict[str, str] | None = None
    total_xp: int = 0
    profile_sections: list[str] | None = None
    profile_card_sections: list[str] | None = None
    daily_mood_checkins_enabled: bool = True
    hall_of_fame_media_ids: dict[str, list[str]] = {}
    onboarding_completed: bool = False
    preferred_media_types: list[str] = []
    preferred_genres: list[str] = []
    preferred_languages: list[str] = []
    discover_emphases: list[str] = []
    date_of_birth: date | None = None
    show_adult_content: bool = False
    country: str | None = None
    is_bot: bool | None = None
    notification_preferences: dict[str, bool] | None = None


# ── Slim response models for /me split endpoints ─────────────────


class MeResponse(BaseModel):
    """Core profile — returned by ``GET /me`` and ``PATCH /me``."""

    id: str
    email: str
    username: str
    is_admin: bool = False
    is_verified: bool
    two_factor_enabled: bool = False
    avatar_url: str | None = None
    bio: str | None = None
    background_url: str | None = None
    total_xp: int = 0
    onboarding_completed: bool = False
    date_of_birth: date | None = None
    show_adult_content: bool = False
    country: str | None = None
    is_bot: bool | None = None


class MePreferencesResponse(BaseModel):
    """User preferences — returned by ``GET /me/preferences``."""

    preferred_media_types: list[str] = []
    preferred_genres: list[str] = []
    preferred_languages: list[str] = []
    discover_emphases: list[str] = []
    daily_mood_checkins_enabled: bool = True
    hall_of_fame_media_ids: dict[str, list[str]] = {}
    profile_sections: list[str] | None = None
    profile_card_sections: list[str] | None = None
    integration_visibility: dict[str, str] | None = None
    notification_preferences: dict[str, bool] | None = None


class MeIntegrationsResponse(BaseModel):
    """Connected service details — returned by ``GET /me/integrations``."""

    steam_id: str | None = None
    plex_id: str | None = None
    tmdb_account_id: int | None = None
    tmdb_username: str | None = None
    tmdb_avatar_url: str | None = None
    tmdb_rating_sync_direction: str | None = None
    google_id: str | None = None
    google_email: str | None = None
    google_name: str | None = None
    google_avatar_url: str | None = None
    drive_connected: bool = False

    # Plex-specific settings
    plex_watch_history_enabled: bool = False


class UserUpdateRequest(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=150, pattern=r"^[a-zA-Z0-9_-]+$")
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=2048)
    background_url: str | None = Field(default=None, max_length=2048)
    integration_visibility: dict[str, str] | None = None
    profile_sections: list[str] | None = None
    profile_card_sections: list[str] | None = None
    daily_mood_checkins_enabled: bool | None = None
    hall_of_fame_media_ids: dict[str, list[str]] | None = None
    onboarding_completed: bool | None = None
    preferred_media_types: list[str] | None = None
    preferred_genres: list[str] | None = None
    preferred_languages: list[str] | None = None
    discover_emphases: list[str] | None = None
    show_adult_content: bool | None = None
    country: str | None = None
    is_private: bool | None = None
    notification_preferences: dict[str, bool] | None = None


# ── Email verification ──────────────────────────────────────────


class VerifyEmailRequest(BaseModel):
    token: str


class VerifyEmailResponse(BaseModel):
    message: str = "Email verified successfully"


class SendVerificationEmailResponse(BaseModel):
    message: str = "Verification email sent"


# ── Password reset ──────────────────────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str = "If the email exists, a reset link has been sent"


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ResetPasswordResponse(BaseModel):
    message: str = "Password reset successfully"


# ── 2FA / TOTP ──────────────────────────────────────────────────


class TwoFactorSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    qr_code_svg: str


class TwoFactorEnableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]+$")


class TwoFactorEnableResponse(BaseModel):
    message: str = "Two-factor authentication enabled successfully"


class TwoFactorLoginVerifyRequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]+$")


class TwoFactorDisableRequest(BaseModel):
    password: str


class TwoFactorDisableResponse(BaseModel):
    message: str = "Two-factor authentication disabled successfully"


# ── Sessions ─────────────────────────────────────────────────────


class SessionResponse(BaseModel):
    session_key: str
    ip_address: str | None = None
    user_agent: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime | None = None


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    current_session_key: str | None = None


class RevokeSessionsResponse(BaseModel):
    message: str
    revoked_count: int = 0


# ── Steam OAuth ──────────────────────────────────────────────────


class SteamInitiateResponse(BaseModel):
    auth_url: str
    state: str


class SteamCallbackResponse(BaseModel):
    message: str = "Steam account linked successfully"


class SteamDisconnectResponse(BaseModel):
    message: str = "Steam account unlinked successfully"


class PlexInitiateResponse(BaseModel):
    auth_url: str
    state: str
    pin_id: str


class SteamCallbackRequest(BaseModel):
    params: dict = Field(default_factory=dict)
    raw_query: str | None = None


class PlexCallbackRequest(BaseModel):
    state: str
    pin_id: str | None = None


class PlexCallbackResponse(BaseModel):
    message: str = "Plex account linked successfully"


class PlexDisconnectResponse(BaseModel):
    message: str = "Plex account unlinked successfully"


class TmdbInitiateResponse(BaseModel):
    auth_url: str
    state: str


class TmdbDisconnectResponse(BaseModel):
    message: str = "TMDb account unlinked successfully"


class TmdbCallbackRequest(BaseModel):
    state: str
    request_token: str


class TmdbCallbackResponse(BaseModel):
    message: str = "TMDb account linked successfully"


class GoogleInitiateResponse(BaseModel):
    auth_url: str
    state: str


class GoogleAccessTokenResponse(BaseModel):
    access_token: str


class GoogleCallbackRequest(BaseModel):
    code: str
    state: str


class GoogleCallbackResponse(BaseModel):
    message: str = "Google account linked successfully"


class GoogleDisconnectResponse(BaseModel):
    message: str = "Google account unlinked successfully"


class PlexServerResponse(BaseModel):
    id: str
    machine_identifier: str
    name: str
    product: str | None = None
    platform: str | None = None
    base_url: str | None = None
    owned: bool
    selected: bool

    model_config = {"from_attributes": True}


class PlexLibraryResponse(BaseModel):
    id: str
    server_id: str
    section_key: str
    title: str
    library_type: str
    selected: bool

    model_config = {"from_attributes": True}


class PlexDiscoveryResponse(BaseModel):
    servers: list[PlexServerResponse]
    libraries: list[PlexLibraryResponse]
    unreachable_servers: list[str] | None = None


class PlexLibraryDetailResponse(BaseModel):
    id: str
    server_id: str
    server_name: str
    section_key: str
    title: str
    library_type: str
    selected: bool
    item_count: int = 0
    last_synced_at: str | None = None


class PlexLibraryListResponse(BaseModel):
    libraries: list[PlexLibraryDetailResponse]


class PlexSyncResponse(BaseModel):
    servers: int = 0
    libraries: int = 0
    total: int = 0
    matched: int = 0
    seeded: int = 0


class PlexSyncTaskResponse(BaseModel):
    task_id: str


class PlexSessionResponse(BaseModel):
    session_id: str
    media_type: str
    title: str
    grandparent_title: str | None = None
    parent_title: str | None = None
    index: int | None = None
    thumb: str | None = None
    duration: int | None = None
    view_offset: int | None = None
    state: str
    user_name: str
    user_thumb: str | None = None
    player_title: str | None = None
    player_device: str | None = None
    player_platform: str | None = None
    server_name: str
    server_id: str
    library_section: str | None = None
    year: int | None = None
    content_rating: str | None = None
    summary: str | None = None
    video_resolution: str | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    audio_channels: int | None = None
    bitrate: int | None = None
    video_decision: str | None = None
    audio_decision: str | None = None
    transcode_reason: str | None = None
    throttled: bool = False


class PlexSessionsResponse(BaseModel):
    sessions: list[PlexSessionResponse]


class PlexTrackItem(BaseModel):
    """A track within a Plex music album."""

    rating_key: str
    title: str
    artist: str = ""
    track_number: int = 0
    disc_number: int = 1
    duration_ms: int | None = None


class PlexAlbumTracksResponse(BaseModel):
    """Response model for album tracks fetched from a Plex server."""

    tracks: list[PlexTrackItem]
    base_url: str | None = None
    token: str | None = None
    rating_key: str | None = None
    album_thumb_url: str | None = None


# ── Integrations ─────────────────────────────────────────────────


class SteamProfileResponse(BaseModel):
    personaname: str | None = None
    avatarfull: str | None = None
    profileurl: str | None = None
    realname: str | None = None
    loccountrycode: str | None = None
    timecreated: int | None = None
    personastate: int | None = None
    lastlogoff: int | None = None


class IntegrationProviderResponse(BaseModel):
    name: str
    connected: bool
    steam_id: str | None = None
    steam_profile: SteamProfileResponse | None = None
    plex_id: str | None = None
    plex_username: str | None = None
    plex_email: str | None = None
    plex_thumb: str | None = None
    tmdb_username: str | None = None
    tmdb_avatar_url: str | None = None
    tmdb_stats: dict | None = None
    tmdb_rating_sync_direction: str | None = None
    google_email: str | None = None
    google_name: str | None = None
    google_avatar_url: str | None = None


class TmdbRatingSyncRequest(BaseModel):
    direction: str = Field(default="disabled", pattern=r"^(disabled|import|export|bidirectional)$")


class TmdbRatingSyncResponse(BaseModel):
    direction: str
    imported: int = 0
    exported: int = 0
    skipped: int = 0
    errors: list[str] | None = None


class TmdbWatchlistImportResponse(BaseModel):
    imported: int = 0
    skipped: int = 0
    errors: list[str] | None = None


class SteamResolveResponse(BaseModel):
    resolved: int = 0
    synced: int = 0
    failed: int = 0
    total: int = 0


class IntegrationsResponse(BaseModel):
    providers: list[IntegrationProviderResponse]
