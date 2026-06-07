from __future__ import annotations

import hashlib
from string import Template

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.schemas.auth import ForgotPasswordRequest, ForgotPasswordResponse
from otix.services.auth.auth_service import AuthService
from otix.services.email_service import EmailService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> ForgotPasswordResponse:
    """Send a password reset email if the email exists.

    Always returns success to prevent email enumeration. If the email
    exists, a reset link is sent via background task.
    """
    await limiter.check_forgot_password(body.email)

    service = AuthService(db)
    token = await service.create_password_reset_token(body.email)
    if token is not None:
        email_service = EmailService()
        reset_url = f"{settings.FRONTEND_BASE_URL}/auth/reset-password?token={token}"
        try:
            template = (settings.EMAIL_TEMPLATES_DIR / "forgot_password.html").read_text(encoding="utf-8")
        except Exception:
            template = '<p>Click <a href="${reset_url}">here</a> to reset your Otix account password.</p>'
        html = Template(template).safe_substitute(reset_url=reset_url)
        background_tasks.add_task(
            email_service.send_email,
            to=[body.email],
            subject="Reset your Otix password",
            html=html,
        )

    logger.info(
        "password reset requested",
        email_hash=hashlib.sha256(body.email.lower().encode()).hexdigest()[:16],
    )
    return ForgotPasswordResponse()
