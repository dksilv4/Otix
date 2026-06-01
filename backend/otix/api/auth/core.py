from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.auth.helpers import _user_response
from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.api.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendVerificationEmailResponse,
    SessionListResponse,
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
from otix.services.auth_service import (
    AuthService,
    decode_token,
    get_refresh_cookie_config,
)
from otix.services.email_service import EmailService
from otix.services.session_service import SessionService
from otix.services.two_factor_service import TwoFactorService

auth_router = APIRouter()

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
            date_of_birth=body.date_of_birth,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    access_token, refresh_token, _ = await service.login(
        body.email,
        body.password,
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
    asyncio.create_task(
        email_service.send_email(
            to=[user.email],
            subject="Verify your Otix account",
            html=html,
        )
    )

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
        body.identity,
        body.password,
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
    asyncio.create_task(
        email_service.send_email(
            to=[current_user.email],
            subject="Verify your Otix account",
            html=html,
        )
    )
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
        asyncio.create_task(
            email_service.send_email(
                to=[body.email],
                subject="Reset your Otix password",
                html=html,
            )
        )
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
        body.challenge_token,
        body.code,
        ip_address=client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge token or verification code")

    access_token, refresh_token, _ = result
    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    return TokenResponse(access_token=access_token)


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
