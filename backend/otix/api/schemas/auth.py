from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=150, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(min_length=8, max_length=128)
    date_of_birth: date


class LoginRequest(BaseModel):
    identity: str = Field(min_length=1, max_length=255)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


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
    spotify_id: str | None = None
    spotify_username: str | None = None
    spotify_email: str | None = None
    spotify_avatar_url: str | None = None
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


# ── Steam OAuth ──────────────────────────────────────────────────


class SteamInitiateResponse(BaseModel):
    auth_url: str
    state: str


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


class TmdbInitiateResponse(BaseModel):
    auth_url: str
    state: str


class TmdbCallbackRequest(BaseModel):
    state: str
    request_token: str


class SpotifyInitiateResponse(BaseModel):
    auth_url: str
    state: str


class SpotifyCallbackRequest(BaseModel):
    code: str
    state: str


class GoogleInitiateResponse(BaseModel):
    auth_url: str
    state: str


class GoogleCallbackRequest(BaseModel):
    code: str
    state: str


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
    spotify_username: str | None = None
    spotify_avatar_url: str | None = None
    spotify_stats: dict | None = None
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
