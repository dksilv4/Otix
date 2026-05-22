from __future__ import annotations

import asyncio
import json
import time
import urllib.parse
import uuid

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.api.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    IntegrationProviderResponse,
    IntegrationsResponse,
    LoginRequest,
    LoginResponse,
    PlexCallbackRequest,
    PlexDiscoveryResponse,
    PlexInitiateResponse,
    PlexLibraryResponse,
    PlexServerResponse,
    PlexSessionResponse,
    PlexSessionsResponse,
    PlexSyncResponse,
    PlexSyncTaskResponse,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendVerificationEmailResponse,
    SessionListResponse,
    GoogleCallbackRequest,
    GoogleInitiateResponse,
    SpotifyCallbackRequest,
    SpotifyInitiateResponse,
    SteamCallbackRequest,
    SteamInitiateResponse,
    SteamResolveResponse,
    SteamProfileResponse,
    TmdbCallbackRequest,
    TmdbInitiateResponse,
    TmdbRatingSyncRequest,
    TmdbRatingSyncResponse,
    TmdbWatchlistImportResponse,
    TokenResponse,
    TwoFactorDisableRequest,
    TwoFactorEnableRequest,
    TwoFactorEnableResponse,
    TwoFactorLoginVerifyRequest,
    TwoFactorSetupResponse,
    UserResponse,
    UserUpdateRequest,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis
from otix.providers.tmdb.client import TMDBProvider
from otix.services.auth_service import (
    AuthService,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_refresh_cookie_config,
)
from otix.services.email_service import EmailService
from otix.services.plex_auth_service import (
    build_plex_link_url,
    link_plex_to_user,
    unlink_plex_from_user,
)
from otix.services.plex_sync_service import discover_plex_libraries, discover_plex_servers, get_plex_sessions
from otix.services.session_service import SessionService
from otix.services.steam_auth_service import (
    build_steam_link_url,
    build_steam_login_url,
    find_or_create_steam_user,
    get_steam_user_info,
    link_steam_to_user,
    unlink_steam_from_user,
    validate_steam_callback,
    validate_steam_link_callback,
)
from otix.services.tmdb_auth_service import (
    build_tmdb_link_url_for_user,
    get_tmdb_account,
    link_tmdb_state_to_user,
    link_tmdb_to_user,
    unlink_tmdb_from_user,
)
from otix.services.tmdb_rating_service import (
    get_tmdb_account_stats,
    import_tmdb_watchlist,
    run_tmdb_rating_sync,
)
from otix.services.two_factor_service import TwoFactorService

auth_router = APIRouter(prefix="/auth", tags=["auth"])

logger = structlog.get_logger()


@auth_router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    try:
        user = await service.register(
            email=body.email,
            username=body.username,
            password=body.password,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    access_token, refresh_token, _ = await service.login(
        body.email, body.password,
        ip_address=client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    assert access_token and refresh_token  # just registered, must succeed

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())

    # Fire-and-forget verification email
    email_service = EmailService()
    token = await service.create_email_verification(user)
    verify_url = f"{settings.frontend_base_url}/auth/verify-email?token={token}"
    html = (
        f'<p>Click <a href="{verify_url}">here</a> to verify your Otix account email.</p>'
        f"<p>This link expires in 24 hours.</p>"
    )
    asyncio.create_task(email_service.send_email(
        to=[user.email],
        subject="Verify your Otix account",
        html=html,
    ))

    return TokenResponse(access_token=access_token)


@auth_router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> LoginResponse:
    ip = client_ip(request)
    await limiter.check_login_by_ip(ip)
    await limiter.check_login_by_identity(body.identity)

    service = AuthService(db)
    result = await service.login(
        body.identity, body.password,
        ip_address=ip,
        user_agent=request.headers.get("User-Agent"),
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token, second_token, _ = result

    if access_token is None:
        # 2FA required — second_token is the challenge token
        return LoginResponse(
            two_factor_required=True,
            challenge_token=second_token,
        )

    response.set_cookie(value=second_token, **get_refresh_cookie_config())
    return LoginResponse(access_token=access_token)


@auth_router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> RefreshResponse:
    await limiter.check_refresh(client_ip(request))

    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    service = AuthService(db)
    result = await service.refresh(refresh_token)
    if result is None:
        cookie_config = get_refresh_cookie_config()
        response.delete_cookie(key=cookie_config["key"], path=cookie_config["path"], domain=cookie_config["domain"])
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    access_token, new_refresh_token, _ = result
    response.set_cookie(value=new_refresh_token, **get_refresh_cookie_config())
    return RefreshResponse(access_token=access_token)


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = AuthService(db)
    await service.logout(current_user.id)

    cookie_config = get_refresh_cookie_config()
    response.delete_cookie(key=cookie_config["key"], path=cookie_config["path"], domain=cookie_config["domain"])


@auth_router.post("/verify-email/send", response_model=SendVerificationEmailResponse)
async def send_verification_email(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SendVerificationEmailResponse:
    await limiter.check_send_verification(current_user.id)

    if current_user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")
    service = AuthService(db)
    email_service = EmailService()
    token = await service.create_email_verification(current_user)
    verify_url = f"{settings.frontend_base_url}/auth/verify-email?token={token}"
    html = (
        f'<p>Click <a href="{verify_url}">here</a> to verify your Otix account email.</p>'
        f"<p>This link expires in 24 hours.</p>"
    )
    asyncio.create_task(email_service.send_email(
        to=[current_user.email],
        subject="Verify your Otix account",
        html=html,
    ))
    return SendVerificationEmailResponse()


@auth_router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> VerifyEmailResponse:
    service = AuthService(db)
    success = await service.verify_email(body.token)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    return VerifyEmailResponse()


@auth_router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> ForgotPasswordResponse:
    await limiter.check_forgot_password(body.email)

    service = AuthService(db)
    token = await service.create_password_reset_token(body.email)
    if token is not None:
        email_service = EmailService()
        reset_url = f"{settings.frontend_base_url}/auth/reset-password?token={token}"
        html = (
            f'<p>Click <a href="{reset_url}">here</a> to reset your Otix account password.</p>'
            f"<p>This link expires in 2 hours.</p>"
            f"<p>If you did not request this, you can safely ignore this email.</p>"
        )
        asyncio.create_task(email_service.send_email(
            to=[body.email],
            subject="Reset your Otix password",
            html=html,
        ))
    return ForgotPasswordResponse()


@auth_router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> ResetPasswordResponse:
    service = AuthService(db)
    success = await service.reset_password(body.token, body.password)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    return ResetPasswordResponse()


# ── 2FA / TOTP ────────────────────────────────────────────────────────


@auth_router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def two_factor_setup(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TwoFactorSetupResponse:
    if current_user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled. Disable it first to set up again.")
    service = TwoFactorService(db)
    info = await service.setup(current_user)
    return TwoFactorSetupResponse(**info)


@auth_router.post("/2fa/enable", response_model=TwoFactorEnableResponse)
async def two_factor_enable(
    body: TwoFactorEnableRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TwoFactorEnableResponse:
    if current_user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    service = TwoFactorService(db)
    success = await service.enable(current_user, body.code)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid verification code. Make sure you've set up 2FA first.")
    return TwoFactorEnableResponse()


@auth_router.post("/2fa/disable", status_code=status.HTTP_200_OK)
async def two_factor_disable(
    body: TwoFactorDisableRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.two_factor_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    service = TwoFactorService(db)
    success = await service.disable(current_user, body.password)
    if not success:
        raise HTTPException(status_code=400, detail="Incorrect password")
    return {"message": "Two-factor authentication disabled successfully"}


@auth_router.post("/2fa/login/verify", response_model=TokenResponse)
async def two_factor_login_verify(
    body: TwoFactorLoginVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    result = await service.verify_2fa_login(
        body.challenge_token, body.code,
        ip_address=client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge token or verification code")

    access_token, refresh_token, _ = result
    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    return TokenResponse(access_token=access_token)


def _gravatar_url(avatar_hash: str | None) -> str | None:
    if not avatar_hash:
        return None
    return f"https://www.gravatar.com/avatar/{avatar_hash}?s=200"


async def _tmdb_stats(user: User) -> dict | None:
    if user.tmdb_session_id is None:
        return None
    try:
        redis = await get_redis()
        provider = TMDBProvider(redis)
        return await get_tmdb_account_stats(provider, user)
    except Exception:
        return None


async def _spotify_stats(user: User) -> dict | None:
    if user.spotify_id is None:
        return None
    try:
        from otix.services.spotify_auth_service import get_user_access_token, get_spotify_user_profile

        token = await get_user_access_token(user)
        if not token:
            return None
        profile = await get_spotify_user_profile(token)
        if not profile:
            return None
        return {
            "followers": (profile.get("followers") or {}).get("total", 0),
            "product": profile.get("product"),
            "country": profile.get("country"),
        }
    except Exception:
        return None


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        two_factor_enabled=user.two_factor_enabled,
        steam_id=user.steam_id,
        plex_id=user.plex_id,
        tmdb_account_id=user.tmdb_account_id,
        tmdb_username=user.tmdb_username,
        tmdb_avatar_url=_gravatar_url(user.tmdb_avatar_hash),
        tmdb_rating_sync_direction=user.tmdb_rating_sync_direction,
        spotify_id=user.spotify_id,
        spotify_username=user.spotify_username,
        spotify_email=user.spotify_email,
        spotify_avatar_url=user.spotify_avatar_url,
        google_id=user.google_id,
        google_email=user.google_email,
        google_name=user.google_name,
        google_avatar_url=user.google_avatar_url,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        integration_visibility=user.integration_visibility if user.integration_visibility else None,
        total_xp=user.total_xp,
        profile_sections=user.profile_sections if user.profile_sections else None,
        profile_card_sections=user.profile_card_sections if user.profile_card_sections else None,
        daily_mood_checkins_enabled=user.daily_mood_checkins_enabled,
        hall_of_fame_media_ids=user.hof_ids,
        onboarding_completed=user.onboarding_completed,
        preferred_media_types=user.preferred_media_types if user.preferred_media_types else [],
        preferred_genres=user.preferred_genres if user.preferred_genres else [],
        preferred_languages=user.preferred_languages if user.preferred_languages else [],
        discover_emphases=user.discover_emphases if user.discover_emphases else [],
    )


@auth_router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return _user_response(current_user)


@auth_router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return _user_response(current_user)


# ── Sessions ──────────────────────────────────────────────────────────


@auth_router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionListResponse:
    service = SessionService(db)
    sessions = await service.list_user_sessions(current_user.id)

    current_session_key = None
    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            current_session_key = payload.get("session_key")
        except Exception:
            pass

    return SessionListResponse(sessions=sessions, current_session_key=current_session_key)


@auth_router.delete("/sessions/{session_key}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = SessionService(db)
    success = await service.revoke_session(session_key)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")


@auth_router.delete("/sessions", status_code=status.HTTP_200_OK)
async def revoke_other_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    current_session_key = ""
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            current_session_key = payload.get("session_key", "")
        except Exception:
            pass

    service = SessionService(db)
    count = await service.revoke_other_sessions(current_user.id, current_session_key)
    return {"message": f"Revoked {count} other session(s)"}


# ── Steam OAuth ──────────────────────────────────────────────────────


@auth_router.post("/steam/initiate", response_model=SteamInitiateResponse)
async def steam_initiate() -> SteamInitiateResponse:
    url, state = await build_steam_login_url()
    return SteamInitiateResponse(auth_url=url, state=state)


@auth_router.post("/steam/callback", response_model=TokenResponse)
async def steam_callback(
    body: SteamCallbackRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    logger.info("steam callback received", params_keys=list(body.params.keys()) if body.params else None)
    steam_id = await validate_steam_callback(body.params, body.raw_query)
    user = await find_or_create_steam_user(db, steam_id)

    from otix.services.session_service import SessionService

    session_key = await SessionService(db).create_session(
        user,
        ip_address=client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    access_token = create_access_token(user.id)
    refresh_token, jti, exp = create_refresh_token(user.id, session_key)

    from otix.domain.user import RefreshToken

    rt = RefreshToken(user_id=user.id, jti=jti, expires_at=exp)
    db.add(rt)
    await db.flush()

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("steam login succeeded", user_id=user.id, steam_id=steam_id)
    return TokenResponse(access_token=access_token)


# ── Integrations ──────────────────────────────────────────────────────


@auth_router.get("/integrations", response_model=IntegrationsResponse)
async def list_integrations(
    current_user: User = Depends(get_current_user),
) -> IntegrationsResponse:
    steam_profile = None
    if current_user.steam_id is not None:
        profile = await get_steam_user_info(current_user.steam_id)
        if profile:
            steam_profile = SteamProfileResponse(
                personaname=profile.get("personaname"),
                avatarfull=profile.get("avatarfull"),
                profileurl=profile.get("profileurl"),
                realname=profile.get("realname"),
                loccountrycode=profile.get("loccountrycode"),
                timecreated=profile.get("timecreated"),
                personastate=profile.get("personastate"),
                lastlogoff=profile.get("lastlogoff"),
            )

    # Backfill tmdb_avatar_hash for existing linked accounts
    if current_user.tmdb_session_id is not None and current_user.tmdb_avatar_hash is None:
        try:
            account = await get_tmdb_account(current_user.tmdb_session_id)
            if account:
                avatar_data = account.get("avatar")
                if isinstance(avatar_data, dict):
                    gravatar = avatar_data.get("gravatar")
                    if isinstance(gravatar, dict):
                        current_user.tmdb_avatar_hash = gravatar.get("hash")
        except Exception:
            pass

    providers = [
        IntegrationProviderResponse(
            name="steam",
            connected=current_user.steam_id is not None,
            steam_id=current_user.steam_id,
            steam_profile=steam_profile,
        ),
        IntegrationProviderResponse(
            name="plex",
            connected=current_user.plex_id is not None,
            plex_id=current_user.plex_id,
            plex_username=current_user.plex_username,
            plex_email=current_user.plex_email,
            plex_thumb=current_user.plex_thumb,
        ),
        IntegrationProviderResponse(
            name="tmdb",
            connected=current_user.tmdb_session_id is not None,
            tmdb_username=current_user.tmdb_username,
            tmdb_avatar_url=_gravatar_url(current_user.tmdb_avatar_hash),
            tmdb_stats=await _tmdb_stats(current_user),
            tmdb_rating_sync_direction=current_user.tmdb_rating_sync_direction,
        ),
        IntegrationProviderResponse(
            name="spotify",
            connected=current_user.spotify_id is not None,
            spotify_username=current_user.spotify_username,
            spotify_avatar_url=current_user.spotify_avatar_url,
            spotify_stats=await _spotify_stats(current_user),
        ),
        IntegrationProviderResponse(
            name="google",
            connected=current_user.google_id is not None,
            google_email=current_user.google_email,
            google_name=current_user.google_name,
            google_avatar_url=current_user.google_avatar_url,
        ),
    ]
    return IntegrationsResponse(providers=providers)


@auth_router.post("/integrations/steam", response_model=SteamInitiateResponse)
async def steam_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> SteamInitiateResponse:
    if current_user.steam_id is not None:
        raise HTTPException(status_code=400, detail="Steam account already linked")
    url, state = await build_steam_link_url()
    return SteamInitiateResponse(auth_url=url, state=state)


@auth_router.post("/integrations/steam/callback")
async def steam_connect_callback(
    body: SteamCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    steam_id = await validate_steam_link_callback(body.params, body.raw_query)
    await link_steam_to_user(db, current_user, steam_id)
    await db.commit()
    return {"message": "Steam account linked successfully"}


@auth_router.delete("/integrations/steam")
async def steam_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await unlink_steam_from_user(db, current_user)
    await db.commit()
    return {"message": "Steam account unlinked successfully"}


@auth_router.post("/integrations/plex", response_model=PlexInitiateResponse)
async def plex_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> PlexInitiateResponse:
    if current_user.plex_id is not None:
        raise HTTPException(status_code=400, detail="Plex account already linked")
    url, state, pin_id = await build_plex_link_url()
    return PlexInitiateResponse(auth_url=url, state=state, pin_id=pin_id)


@auth_router.post("/integrations/plex/callback")
async def plex_connect_callback(
    body: PlexCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await link_plex_to_user(db, current_user, body.state, body.pin_id)
    await db.commit()
    return {"message": "Plex account linked successfully"}


@auth_router.delete("/integrations/plex")
async def plex_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await unlink_plex_from_user(db, current_user)
    await db.commit()
    return {"message": "Plex account unlinked successfully"}


@auth_router.post("/integrations/tmdb", response_model=TmdbInitiateResponse)
async def tmdb_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> TmdbInitiateResponse:
    if current_user.tmdb_session_id is not None:
        raise HTTPException(status_code=400, detail="TMDb account already linked")
    redirect_url = str(request.url_for("tmdb_connect_redirect"))
    url, state = await build_tmdb_link_url_for_user(current_user.id, redirect_url)
    return TmdbInitiateResponse(auth_url=url, state=state)


def _tmdb_frontend_redirect(status_value: str, message: str | None = None) -> RedirectResponse:
    query = {"tmdb_link": status_value}
    if message:
        query["message"] = message
    url = f"{settings.frontend_base_url.rstrip('/')}/?{urllib.parse.urlencode(query)}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


@auth_router.get("/integrations/tmdb/redirect", name="tmdb_connect_redirect")
async def tmdb_connect_redirect(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    approved = request.query_params.get("approved")
    state_value = request.query_params.get("state") or ""
    request_token = request.query_params.get("request_token")

    if approved == "false":
        return _tmdb_frontend_redirect("error", "TMDb authorization was cancelled.")
    if not state_value and not request_token:
        return _tmdb_frontend_redirect("error", "TMDb did not return the expected authorization details.")

    try:
        await link_tmdb_state_to_user(db, state_value, request_token)
        await db.commit()
    except HTTPException as exc:
        await db.rollback()
        detail = exc.detail if isinstance(exc.detail, str) else "Failed to link TMDb account."
        return _tmdb_frontend_redirect("error", detail)
    except Exception:
        await db.rollback()
        logger.exception("tmdb connect redirect failed")
        return _tmdb_frontend_redirect("error", "Failed to link TMDb account. Please try again.")

    return _tmdb_frontend_redirect("success")


@auth_router.post("/integrations/tmdb/callback")
async def tmdb_connect_callback(
    body: TmdbCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await link_tmdb_to_user(db, current_user, body.state, body.request_token)
    await db.commit()
    return {"message": "TMDb account linked successfully"}


@auth_router.post("/integrations/tmdb/rating-sync", response_model=TmdbRatingSyncResponse)
async def tmdb_rating_sync(
    body: TmdbRatingSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TmdbRatingSyncResponse:
    if current_user.tmdb_session_id is None:
        raise HTTPException(status_code=400, detail="TMDb account not linked")

    current_user.tmdb_rating_sync_direction = body.direction
    await db.flush()

    redis = await get_redis()
    provider = TMDBProvider(redis)
    try:
        result = await run_tmdb_rating_sync(db, provider, current_user, body.direction)
        current_user.tmdb_rating_last_synced_at = func.now()
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return TmdbRatingSyncResponse(
        direction=result.direction,
        imported=result.imported,
        exported=result.exported,
        skipped=result.skipped,
        errors=result.errors,
    )


@auth_router.post("/integrations/tmdb/watchlist-import", response_model=TmdbWatchlistImportResponse)
async def tmdb_watchlist_import(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TmdbWatchlistImportResponse:
    if current_user.tmdb_session_id is None:
        raise HTTPException(status_code=400, detail="TMDb account not linked")

    redis = await get_redis()
    provider = TMDBProvider(redis)
    try:
        result = await import_tmdb_watchlist(db, provider, current_user)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return TmdbWatchlistImportResponse(
        imported=result.imported,
        skipped=result.skipped,
        errors=result.errors,
    )


@auth_router.delete("/integrations/tmdb")
async def tmdb_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await unlink_tmdb_from_user(db, current_user)
    await db.commit()
    return {"message": "TMDb account unlinked successfully"}


# ── Spotify OAuth2 ──────────────────────────────────────────────────────


@auth_router.post("/integrations/spotify", response_model=SpotifyInitiateResponse)
async def spotify_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start Spotify account linking. Returns authorization URL."""
    from otix.services.spotify_auth_service import build_spotify_link_url

    url, state = await build_spotify_link_url()
    return {"auth_url": url, "state": state}


@auth_router.post("/integrations/spotify/callback")
async def spotify_connect_callback(
    body: SpotifyCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Complete Spotify account linking with the authorization code."""
    from otix.services.spotify_auth_service import link_spotify_to_user

    try:
        await link_spotify_to_user(db, current_user, body.code, body.state)
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("spotify linking failed", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Failed to link Spotify account. Please try again.") from err

    await db.commit()
    return {"message": "Spotify account linked successfully"}


@auth_router.delete("/integrations/spotify")
async def spotify_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from otix.services.spotify_auth_service import unlink_spotify_from_user

    await unlink_spotify_from_user(db, current_user)
    await db.commit()
    return {"message": "Spotify account unlinked successfully"}


# ── Google ────────────────────────────────────────────────────────


@auth_router.post("/integrations/google", response_model=GoogleInitiateResponse)
async def google_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start Google account linking. Returns authorization URL."""
    from otix.services.google_auth_service import build_google_link_url

    url, state = await build_google_link_url()
    return {"auth_url": url, "state": state}


@auth_router.post("/integrations/google/callback")
async def google_connect_callback(
    body: GoogleCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Complete Google account linking with the authorization code."""
    from otix.services.google_auth_service import link_google_to_user

    try:
        await link_google_to_user(db, current_user, body.code, body.state)
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("google linking failed", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Failed to link Google account. Please try again.") from err

    await db.commit()
    return {"message": "Google account linked successfully"}


@auth_router.delete("/integrations/google")
async def google_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from otix.services.google_auth_service import unlink_google_from_user

    await unlink_google_from_user(db, current_user)
    await db.commit()
    return {"message": "Google account unlinked successfully"}


@auth_router.post("/integrations/spotify/sync", status_code=status.HTTP_202_ACCEPTED)
async def spotify_sync_library(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a Spotify library sync. Returns a task_id for SSE streaming."""
    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")

    task_id = str(uuid.uuid4())
    logger.info("spotify sync task started", user_id=current_user.id, task_id=task_id)

    # Run sync in-process via background asyncio task so it starts immediately
    # (Celery queues are backed up too far for user-initiated actions)
    asyncio.create_task(_run_spotify_sync_background(task_id, current_user.id))

    return {"task_id": task_id}


async def _run_spotify_sync_background(task_id: str, user_id: str) -> None:
    """Run the Spotify library sync in a background asyncio task within the API process."""
    from otix.infrastructure.database import async_session
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_library_service import sync_spotify_user_library

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.spotify_id is None:
                return

            token = await get_user_access_token(user)
            if token is None:
                logger.warning("spotify sync failed, no valid token", user_id=user_id)
                from otix.lib.spotify_progress import publish_progress, store_result
                await publish_progress(task_id, "error", message="No valid Spotify token. Try reconnecting your account.")
                await store_result(task_id, {"error": "No valid token"})
                return

            await sync_spotify_user_library(session, user, token, task_id=task_id)
            await session.commit()
    except Exception:
        logger.exception("spotify sync background task failed", user_id=user_id, task_id=task_id)


@auth_router.get("/integrations/spotify/sync/{task_id}/stream")
async def spotify_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams Spotify sync progress events via Redis pub/sub.

    Replays the latest stored progress on reconnect so the user sees current
    state even after reloading the page.
    """
    from otix.lib.spotify_progress import get_stored_result, get_latest_progress

    channel = f"spotify:sync:{task_id}:events"

    # Check if the task already finished before the SSE subscriber connected
    stored = await get_stored_result(task_id)
    if stored is not None:
        stored["type"] = "sync_complete"
        payload = json.dumps(stored)

        async def replay():
            yield f"data: {payload}\n\n"

        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Replay the latest intermediate progress if available (reconnect case)
    latest = await get_latest_progress(task_id)

    async def event_generator():
        # Replay latest progress first so reconnecting clients see current phase
        if latest is not None:
            yield f"data: {json.dumps(latest)}\n\n"

        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0  # 5-minute idle timeout
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    # Send keep-alive comment so proxies don't close the connection
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0

                event = json.loads(data)
                if event.get("type") in ("sync_complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@auth_router.post("/integrations/spotify/recently-played/sync", status_code=status.HTTP_202_ACCEPTED)
async def spotify_sync_recently_played(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a Spotify recently played sync. Returns a task_id for SSE streaming."""
    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")

    task_id = str(uuid.uuid4())
    logger.info("spotify recently played sync task started", user_id=current_user.id, task_id=task_id)

    asyncio.create_task(_run_spotify_recently_played_background(task_id, current_user.id))

    return {"task_id": task_id}


async def _run_spotify_recently_played_background(task_id: str, user_id: str) -> None:
    """Run the Spotify recently played sync in a background asyncio task."""
    from otix.infrastructure.database import async_session
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_library_service import sync_spotify_recently_played

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.spotify_id is None:
                return

            token = await get_user_access_token(user)
            if token is None:
                logger.warning("spotify recently played sync failed, no valid token", user_id=user_id)
                from otix.lib.spotify_progress import publish_progress, store_result
                await publish_progress(task_id, "error", message="No valid Spotify token. Try reconnecting your account.")
                await store_result(task_id, {"error": "No valid token"})
                return

            await sync_spotify_recently_played(session, user, token, task_id=task_id)
            await session.commit()
    except Exception:
        logger.exception("spotify recently played sync background task failed", user_id=user_id, task_id=task_id)


@auth_router.get("/integrations/spotify/recently-played/sync/{task_id}/stream")
async def spotify_recently_played_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams Spotify recently played sync progress events."""
    from otix.lib.spotify_progress import get_stored_result, get_latest_progress

    channel = f"spotify:sync:{task_id}:events"

    stored = await get_stored_result(task_id)
    if stored is not None:
        stored["type"] = "sync_complete"
        payload = json.dumps(stored)

        async def replay():
            yield f"data: {payload}\n\n"

        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    latest = await get_latest_progress(task_id)

    async def event_generator():
        if latest is not None:
            yield f"data: {json.dumps(latest)}\n\n"

        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0

                event = json.loads(data)
                if event.get("type") in ("sync_complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@auth_router.get("/integrations/spotify/token")
async def spotify_get_token(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return a valid Spotify access token for the Web Playback SDK."""
    from otix.services.spotify_auth_service import get_user_access_token

    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")

    token = await get_user_access_token(current_user)
    if token is None:
        raise HTTPException(status_code=502, detail="Unable to get Spotify token")

    return {"accessToken": token, "expiresIn": 3600}


@auth_router.get("/integrations/plex/servers", response_model=PlexDiscoveryResponse)
async def plex_discover_servers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexDiscoveryResponse:
    try:
        servers = await discover_plex_servers(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except httpx.HTTPStatusError as e:
        failed_url = str(e.request.url) if e.request else "unknown"
        logger.warning(
            "plex discover http error",
            user_id=current_user.id,
            url=failed_url,
            status=e.response.status_code,
            body=e.response.text[:500] if e.response else "",
        )
        raise HTTPException(
            status_code=502,
            detail=f"Plex returned {e.response.status_code} for {failed_url}. The server may be unreachable or the connection may need to be refreshed.",
        )
    except httpx.TimeoutException:
        failed_url = str(e.request.url) if e.request else "unknown"
        logger.warning("plex discover timeout", user_id=current_user.id, url=failed_url)
        raise HTTPException(
            status_code=504,
            detail=f"Connection to Plex timed out ({failed_url}). Check that your server is running and remote access is enabled.",
        )
    except httpx.ConnectError:
        failed_url = str(e.request.url) if e.request else "unknown"
        logger.warning("plex discover connection error", user_id=current_user.id, url=failed_url)
        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to Plex at {failed_url}. Check that your server is running and remote access is enabled.",
        )
    except Exception:
        logger.exception("plex discover failed", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Failed to discover Plex servers. Please try again later.")

    # Discover libraries per-server, skipping unreachable ones
    libraries = []
    unreachable_servers = []
    for server in servers:
        try:
            libraries.extend(await discover_plex_libraries(db, current_user, server))
        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPStatusError):
            logger.warning("plex server unreachable during discovery, skipping",
                           server_name=server.name, machine_id=server.machine_identifier)
            unreachable_servers.append(server.name)
    await db.commit()

    return PlexDiscoveryResponse(
        servers=[PlexServerResponse.model_validate(server) for server in servers],
        libraries=[PlexLibraryResponse.model_validate(library) for library in libraries],
        unreachable_servers=unreachable_servers if unreachable_servers else None,
    )


@auth_router.post(
    "/integrations/plex/sync",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=PlexSyncTaskResponse,
)
async def plex_sync_now(
    current_user: User = Depends(get_current_user),
) -> PlexSyncTaskResponse:
    """Start a Plex sync task on the Celery fast queue. Returns a task_id for SSE streaming."""
    from otix.infrastructure.celery import app as celery_app

    task_id = str(uuid.uuid4())
    celery_app.send_task(
        "maintenance.plex_sync_user",
        args=[task_id, current_user.id],
    )
    logger.info("plex sync task enqueued", user_id=current_user.id, task_id=task_id)
    return PlexSyncTaskResponse(task_id=task_id)


@auth_router.get("/integrations/plex/sync/{task_id}/stream")
async def plex_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams Plex sync progress events via Redis pub/sub."""
    from otix.lib.plex_progress import get_stored_result

    channel = f"plex:sync:{task_id}:events"

    # Check if the task already finished before the SSE subscriber connected
    stored = await get_stored_result(task_id)
    if stored is not None:
        stored["type"] = "sync_complete"
        payload = json.dumps(stored)

        async def replay():
            yield f"data: {payload}\n\n"

        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def event_generator():
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0  # 5-minute idle timeout
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    # Send keep-alive comment so proxies don't close the connection
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0

                event = json.loads(data)
                if event.get("type") in ("sync_complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@auth_router.post("/integrations/plex/watchlist/sync")
async def plex_watchlist_sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.plex_id:
        raise HTTPException(status_code=400, detail="No Plex account linked")

    from otix.services.plex_sync_service import sync_plex_watchlist
    try:
        result = await sync_plex_watchlist(db, current_user)
        await db.commit()
    except Exception as e:
        logger.exception("plex watchlist sync failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to sync Plex watchlist. Please try again.")
    return result


@auth_router.post("/integrations/plex/webhook")
async def plex_webhook(request: Request) -> dict:
    payload = None
    content_type = request.headers.get("content-type", "")
    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            raw_payload = form.get("payload")
            if isinstance(raw_payload, str):
                payload = json.loads(raw_payload)
        elif "application/json" in content_type:
            payload = await request.json()
    except Exception:
        logger.exception("plex webhook payload parse failed")

    from otix.infrastructure.celery import app

    app.send_task("maintenance.sync_plex_accounts")
    return {
        "status": "accepted",
        "event": payload.get("event") if isinstance(payload, dict) else None,
    }


@auth_router.get("/integrations/plex/sessions", response_model=PlexSessionsResponse)
async def plex_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexSessionsResponse:
    if not current_user.plex_auth_token:
        raise HTTPException(status_code=400, detail="No Plex account linked")
    sessions = await get_plex_sessions(db, current_user)
    return PlexSessionsResponse(sessions=[PlexSessionResponse(**s) for s in sessions])


@auth_router.post("/integrations/steam/scan")
async def steam_scan_library(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.steam_api_key:
        raise HTTPException(status_code=503, detail="Steam API key not configured")

    from otix.providers.steam.client import SteamError
    from otix.providers.base import ProviderError
    from otix.services.steam_library_service import scan_steam_library

    try:
        result = await scan_steam_library(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (SteamError, ProviderError) as e:
        logger.exception("steam library scan failed")
        raise HTTPException(status_code=502, detail=f"Steam API error: {e}")
    except Exception as e:
        logger.exception("steam library scan failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to scan Steam library. Please try again.")

    return result


@auth_router.post("/integrations/steam/wishlist/scan")
async def steam_scan_wishlist(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.steam_api_key:
        raise HTTPException(status_code=503, detail="Steam API key not configured")

    from otix.providers.steam.client import SteamError
    from otix.providers.base import ProviderError
    from otix.services.steam_library_service import scan_steam_wishlist

    try:
        result = await scan_steam_wishlist(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (SteamError, ProviderError) as e:
        logger.exception("steam wishlist scan failed")
        raise HTTPException(status_code=502, detail=f"Steam API error: {e}")
    except Exception as e:
        logger.exception("steam wishlist scan failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to scan Steam wishlist. Please try again.")

    return result


@auth_router.post("/integrations/steam/resolve-unmatched", response_model=SteamResolveResponse)
async def steam_resolve_unmatched(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.igdb_client_id:
        raise HTTPException(status_code=503, detail="IGDB not configured")

    from otix.services.steam_igdb_resolver import resolve_unmatched_steam_games

    try:
        result = await resolve_unmatched_steam_games(db, current_user.id)
    except Exception:
        logger.exception("steam-igdb resolve failed")
        raise HTTPException(status_code=500, detail="Failed to resolve unmatched games. Please try again.")

    return {
        "resolved": result.resolved,
        "synced": result.synced,
        "failed": result.failed,
        "total": result.total,
    }


# ── YouTube watch history sync ──────────────────────────────────────────


@auth_router.post("/integrations/youtube/sync", status_code=status.HTTP_202_ACCEPTED)
async def youtube_sync_watch_history(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a YouTube watch history sync. Returns a task_id for SSE streaming."""
    if current_user.google_id is None:
        raise HTTPException(status_code=400, detail="No Google account linked")

    task_id = str(uuid.uuid4())
    logger.info("youtube sync task started", user_id=current_user.id, task_id=task_id)

    asyncio.create_task(_run_youtube_sync_background(task_id, current_user.id))

    return {"task_id": task_id}


async def _run_youtube_sync_background(task_id: str, user_id: str) -> None:
    from otix.infrastructure.database import async_session
    from otix.lib.youtube_progress import publish_progress, store_result
    from otix.services.youtube_sync_service import sync_youtube_watch_history

    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None or user.google_id is None:
                return

            await sync_youtube_watch_history(session, user, task_id=task_id)
            await session.commit()
    except Exception as e:
        logger.exception("youtube sync background task failed", user_id=user_id, task_id=task_id)
        msg = str(e)
        if hasattr(e, 'message'):
            msg = e.message
        await publish_progress(task_id, "error", message=msg)
        await store_result(task_id, {"error": msg})


@auth_router.get("/integrations/youtube/sync/{task_id}/stream")
async def youtube_sync_stream(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams YouTube sync progress events via Redis pub/sub."""
    from otix.lib.youtube_progress import get_stored_result, get_latest_progress

    channel = f"youtube:sync:{task_id}:events"

    stored = await get_stored_result(task_id)
    if stored is not None:
        stored["type"] = "sync_complete"
        payload = json.dumps(stored)

        async def replay():
            yield f"data: {payload}\n\n"

        return StreamingResponse(
            replay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    latest = await get_latest_progress(task_id)

    async def event_generator():
        if latest is not None:
            yield f"data: {json.dumps(latest)}\n\n"

        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0

                event = json.loads(data)
                if event.get("type") in ("sync_complete", "error"):
                    break
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
