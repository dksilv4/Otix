from unittest.mock import patch

import pytest

from otix.infrastructure.config import settings
from otix.services.email_service import EmailService


@pytest.mark.asyncio
async def test_send_email_no_api_key():
    with patch.object(settings, "resend_api_key", None):
        service = EmailService()
        result = await service.send_email(
            to=["test@example.com"],
            subject="Test Subject",
            html="<p>Test</p>"
        )
        assert result is False

@pytest.mark.asyncio
async def test_send_email_success():
    with patch.object(settings, "resend_api_key", "test_key"), \
         patch.object(settings, "email_from", "Otix <noreply@otix.com>"), \
         patch("resend.Emails.send") as mock_send:

        service = EmailService()
        result = await service.send_email(
            to=["test@example.com"],
            subject="Test Subject",
            html="<p>Test</p>",
            text="Test text"
        )
        assert result is True
        mock_send.assert_called_once_with({
            "from": "Otix <noreply@otix.com>",
            "to": ["test@example.com"],
            "subject": "Test Subject",
            "html": "<p>Test</p>",
            "text": "Test text"
        })

@pytest.mark.asyncio
async def test_send_email_failure():
    with patch.object(settings, "resend_api_key", "test_key"), \
         patch.object(settings, "email_from", "Otix <noreply@otix.com>"), \
         patch("resend.Emails.send", side_effect=Exception("API Error")) as mock_send:

        service = EmailService()
        result = await service.send_email(
            to=["test@example.com"],
            subject="Test Subject",
            html="<p>Test</p>"
        )
        assert result is False
        mock_send.assert_called_once()
