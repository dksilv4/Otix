from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from otix.services.push_service import PushService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> PushService:
    return PushService(mock_db_session, "test_private_key", "test_public_key")


class TestPushService:
    async def test_subscribe(self, service: PushService, mock_db_session: AsyncMock):
        sub = await service.subscribe("user-1", "https://example.com/push", "p256dh_key", "auth_key")
        assert sub.endpoint == "https://example.com/push"
        mock_db_session.add.assert_called_once()
        mock_db_session.flush.assert_awaited()

    async def test_unsubscribe(self, service: PushService, mock_db_session: AsyncMock):
        await service.unsubscribe("user-1", "https://example.com/push")
        mock_db_session.execute.assert_awaited_once()
        mock_db_session.flush.assert_awaited()
