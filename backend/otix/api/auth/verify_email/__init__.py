from __future__ import annotations

from string import Template

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.schemas.auth import SendVerificationEmailResponse, VerifyEmailRequest, VerifyEmailResponse
from otix.services.auth.auth_service import AuthService
from otix.services.email_service import EmailService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/verify-email/send", response_model=SendVerificationEmailResponse)
async def send_verification_email(
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SendVerificationEmailResponse:
    """Send a verification email to the authenticated user.

    Generates a verification token and sends it via email in a
    background task. Rate-limited per user ID.
    """
    ip = client_ip(request)
    await limiter.check_send_verification(current_user.id)

    if current_user.is_verified:
        logger.warning("verify email already verified", user_id=current_user.id, ip=ip)
        raise HTTPException(status_code=400, detail="Email already verified")

    service = AuthService(db)
    email_service = EmailService()

    try:
        token = await service.create_email_verification(current_user)
    except Exception:
        logger.exception("failed to create verification token", user_id=current_user.id, ip=ip)
        raise

    verify_url = f"{settings.FRONTEND_BASE_URL}/auth/verify-email?token={token}"
    template = (settings.EMAIL_TEMPLATES_DIR / "verify_email.html").read_text(encoding="utf-8")
    html = Template(template).safe_substitute(verify_url=verify_url)

    background_tasks.add_task(
        email_service.send_email,
        to=[current_user.email],
        subject="Verify your Otix account",
        html=html,
    )

    logger.info("verification email sent", user_id=current_user.id, ip=ip)
    return SendVerificationEmailResponse()


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    body: VerifyEmailRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> VerifyEmailResponse:
    """Verify a user's email address using a token.

    Consumes the verification token sent via the send endpoint.
    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_verify_email(ip)

    service = AuthService(db)
    try:
        success = await service.verify_email(body.token)
    except Exception:
        logger.exception("verify email token validation failed", ip=ip)
        raise

    if not success:
        logger.info("verify email invalid or expired token", ip=ip)
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    logger.info("email verified successfully", ip=ip)
    return VerifyEmailResponse()
