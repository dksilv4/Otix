from __future__ import annotations

import asyncio
import json
import time
import uuid

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
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
    PlexSyncResponse,
    PlexSyncTaskResponse,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendVerificationEmailResponse,
    SessionListResponse,
    SteamCallbackRequest,
    SteamInitiateResponse,
    SteamProfileResponse,
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
from otix.services.plex_sync_service import discover_plex_libraries, discover_plex_servers
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


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_verified=user.is_verified,
        two_factor_enabled=user.two_factor_enabled,
        steam_id=user.steam_id,
        plex_id=user.plex_id,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        integration_visibility=user.integration_visibility if user.integration_visibility else None,
        total_xp=user.total_xp,
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
    if body.username is not None:
        current_user.username = body.username
    if body.email is not None:
        current_user.email = body.email
    if body.bio is not None:
        current_user.bio = body.bio
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.background_url is not None:
        current_user.background_url = body.background_url
    if body.integration_visibility is not None:
        current_user.integration_visibility = body.integration_visibility
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


@auth_router.get("/integrations/plex/servers", response_model=PlexDiscoveryResponse)
async def plex_discover_servers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexDiscoveryResponse:
    try:
        servers = await discover_plex_servers(db, current_user)
        libraries = []
        for server in servers:
            libraries.extend(await discover_plex_libraries(db, current_user, server))
        await db.commit()
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
    return PlexDiscoveryResponse(
        servers=[PlexServerResponse.model_validate(server) for server in servers],
        libraries=[PlexLibraryResponse.model_validate(library) for library in libraries],
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
        queue="fast",
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
