"""Transactional email for the auth slice.

Sent synchronously for now (Celery workers are a deferred platform task). The
link base is ``settings.FRONTEND_URL``; the browser app owns the token
consumption pages.
"""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail


def send_action_email(to_email: str, subject: str, path: str, raw_token: str) -> None:
    """Email a single-use token link, e.g. ``/auth/verify-email?token=...``."""
    link = f"{settings.FRONTEND_URL}{path}?token={raw_token}"
    send_mail(
        subject=subject,
        message=(
            f"Your Otix {subject} link is:\n\n{link}\n\n"
            "This link expires in 24 hours and can only be used once."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=False,
    )
