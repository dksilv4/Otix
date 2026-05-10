from __future__ import annotations

import asyncio

import resend
import structlog

from otix.infrastructure.config import settings

logger = structlog.get_logger()


class EmailService:
    def __init__(self):
        resend.api_key = settings.resend_api_key

    async def send_email(
        self,
        to: list[str],
        subject: str,
        html: str,
        text: str | None = None,
    ) -> bool:
        if not settings.resend_api_key:
            logger.warning("resend_api_key not set, skipping email", to=to, subject=subject)
            return False
        try:
            params: dict = {
                "from": settings.email_from,
                "to": to,
                "subject": subject,
                "html": html,
            }
            if text:
                params["text"] = text
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info("email sent", to=to, subject=subject)
            return True
        except Exception:
            logger.exception("failed to send email", to=to, subject=subject)
            return False
