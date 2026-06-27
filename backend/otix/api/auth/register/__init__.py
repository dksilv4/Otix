from __future__ import annotations

from string import Template

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.lib.tokens import get_refresh_cookie_config
from otix.schemas.auth import RegisterRequest, RegisterResponse, RegisterUserInfo
from otix.services.auth.auth_service import AuthService
from otix.services.email_service import EmailService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> RegisterResponse:
    ip = client_ip(request)
    await limiter.check_register(ip)

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
        ip_address=ip,
        user_agent=request.headers.get("User-Agent"),
    )
    assert access_token and refresh_token

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())

    # Send verification email in the background
    email_service = EmailService()
    email_token = await service.create_email_verification(user)
    verify_url = f"{settings.frontend_base_url}/auth/verify-email?token={email_token}"
    template = (settings.EMAIL_TEMPLATES_DIR / "verify_email.html").read_text(encoding="utf-8")
    html = Template(template).safe_substitute(verify_url=verify_url)
    background_tasks.add_task(
        email_service.send_email,
        to=[user.email],
        subject="Verify your Otix account",
        html=html,
    )

    logger.info("user registered", user_id=user.id, ip=ip)
    return RegisterResponse(
        access_token=access_token,
        user=RegisterUserInfo(
            id=user.id,
            email=user.email,
            username=user.username,
            is_verified=user.is_verified,
            total_xp=user.total_xp,
            onboarding_completed=user.onboarding_completed,
        ),
    )


