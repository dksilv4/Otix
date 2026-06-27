"""Tests for match confirmation with confirmed_count."""

from unittest.mock import AsyncMock

import pytest

from otix.schemas.media import ConfirmMatchRequest
from otix.services.external_id_service import ExternalIDService
from otix.services.match_confirmation import MatchConfirmationService


class MockExternalID:
    def __init__(self, provider="epic", external_id="Jaguar", entity_id="otix_abc123"):
        self.provider = provider
        self.external_id = external_id
        self.entity_id = entity_id
        self.media_item_id = entity_id
        self.entity_type = "media_item"
        self.confirmed_count = 0
        self.confirmed_by = []
        self.last_confirmed_at = None


@pytest.mark.asyncio
async def test_confirm_increments_confirmed_count():
    """Confirming a match increments confirmed_count on external_ids."""
    session = AsyncMock()
    eid_svc = ExternalIDService(session)
    eid_svc.upsert = AsyncMock()
    eid_svc.increment_confirmed = AsyncMock()
    eid_svc._session = session

    svc = MatchConfirmationService(session)
    svc._eid_svc = eid_svc

    result = await svc.confirm(
        ConfirmMatchRequest(
            query_id="epic:Jaguar",
            media_item_id="otix_abc123",
        )
    )

    assert result.success is True
    assert result.media_item_id == "otix_abc123"
    eid_svc.increment_confirmed.assert_called_once_with("epic", "Jaguar", "desktop_user", "media_item")


@pytest.mark.asyncio
async def test_confirm_without_media_id_returns_error():
    """Confirm without media_item_id or igdb_id returns error."""
    session = AsyncMock()
    svc = MatchConfirmationService(session)
    result = await svc.confirm(ConfirmMatchRequest(query_id="epic:Jaguar"))
    assert result.success is False
    assert "media_item_id" in (result.error or "").lower()


@pytest.mark.asyncio
async def test_increment_confirmed_dedup_by_user():
    """Same user confirming twice does not double-count."""
    session = AsyncMock()
    eid_svc = ExternalIDService(session)

    mock_row = MockExternalID()
    eid_svc.get_by_provider_ext_id = AsyncMock(return_value=mock_row)
    eid_svc._session = session

    # First call — should increment
    row1 = await eid_svc.increment_confirmed("epic", "Jaguar", "desktop_user", "media_item")
    assert row1 is not None
    assert row1.confirmed_count == 1
    assert row1.confirmed_by == ["desktop_user"]

    # Second call — same user, should NOT increment (dedup)
    row2 = await eid_svc.increment_confirmed("epic", "Jaguar", "desktop_user", "media_item")
    assert row2 is not None
    assert row2.confirmed_count == 1  # unchanged
    assert row2.confirmed_by == ["desktop_user"]


@pytest.mark.asyncio
async def test_increment_confirmed_multiple_users():
    """Different users confirming both increment the count."""
    session = AsyncMock()
    eid_svc = ExternalIDService(session)

    mock_row = MockExternalID()
    eid_svc.get_by_provider_ext_id = AsyncMock(return_value=mock_row)
    eid_svc._session = session

    row = await eid_svc.increment_confirmed("epic", "Jaguar", "user_a", "media_item")
    assert row.confirmed_count == 1
    assert "user_a" in row.confirmed_by

    row = await eid_svc.increment_confirmed("epic", "Jaguar", "user_b", "media_item")
    assert row.confirmed_count == 2
    assert "user_b" in row.confirmed_by


@pytest.mark.asyncio
async def test_increment_confirmed_nonexistent_row():
    """increment_confirmed on a nonexistent external_id returns None."""
    session = AsyncMock()
    eid_svc = ExternalIDService(session)
    eid_svc.get_by_provider_ext_id = AsyncMock(return_value=None)
    eid_svc._session = session

    result = await eid_svc.increment_confirmed("epic", "NonExistent", "desktop_user", "media_item")
    assert result is None
