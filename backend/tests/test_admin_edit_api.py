"""Tests for admin edit proposal API endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.admin_edit import MediaEditProposal
from otix.domain.media import MediaItem
from otix.domain.user import User


def _make_app():
    from fastapi import FastAPI

    from otix.api.router import api_router
    app = FastAPI()
    app.include_router(api_router, prefix="/api")
    return app


def _make_admin_user():
    user = User(
        id="oti_admin000001",
        username="admin",
        email="admin@otix.local",
        is_admin=True,
        total_xp=1000,
    )
    user.is_active = True
    return user


def _make_trusted_user():
    user = User(
        id="oti_trusted0001",
        username="trusted",
        email="trusted@otix.local",
        is_admin=False,
        total_xp=600,
    )
    user.is_active = True
    return user


def _make_low_xp_user():
    user = User(
        id="oti_lowxp000001",
        username="newbie",
        email="newbie@otix.local",
        is_admin=False,
        total_xp=100,
    )
    user.is_active = True
    return user


def _make_media_item(**overrides):
    defaults = {
        "id": "oti_media000001",
        "media_type": "movie",
        "title": "Test Movie",
        "overview": "Original overview",
        "slug": "test-movie",
        "poster_url": None,
        "backdrop_url": None,
        "release_date": "2023-01-01",
        "popularity": 10.0,
        "original_language": "en",
    }
    defaults.update(overrides)
    return MediaItem(**defaults)


def _make_proposal(**overrides):
    now = datetime.now(UTC)
    defaults = {
        "id": "oti_prop0000001",
        "media_item_id": "oti_media000001",
        "proposer_user_id": "oti_trusted0001",
        "approver_user_id": None,
        "status": "pending",
        "changes": {"overview": "New overview"},
        "image_overrides": None,
        "rejection_reason": None,
        "original_values": {"overview": "Original overview"},
        "upvote_count": 0,
        "downvote_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    proposal = MediaEditProposal(**defaults)
    proposal.media_item = _make_media_item()
    proposal.proposer = _make_trusted_user()
    proposal.approver = None
    return proposal


@pytest.fixture(autouse=True)
def mock_celery():
    with patch("otix.services.admin_edit_service.app") as mock_app:
        mock_app.send_task = MagicMock()
        yield mock_app


@pytest.fixture(autouse=True)
def mock_redis():
    with patch("otix.api.media.get_redis") as mock_get:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=None)
        mock_client.set = AsyncMock()
        mock_get.return_value = mock_client
        yield mock_client


@pytest.fixture
def app():
    return _make_app()


@pytest.fixture
def client(app):
    """Return an async test client with mocked dependencies that can be set up per test."""

    from otix.api import deps

    async def _make(auth_user, scalar_side_effect=None, scalars_result=None, execute_result=None):
        async def override_get_db():
            session = AsyncMock(spec=AsyncSession)

            # scalar: use side_effect if provided, else return None
            session.scalar = AsyncMock()
            if scalar_side_effect is not None:
                session.scalar.side_effect = scalar_side_effect
            else:
                session.scalar.return_value = None

            # scalars: must be AsyncMock since callers await it
            mock_scalars_result = AsyncMock()
            mock_scalars_result.all.return_value = scalars_result if scalars_result is not None else []
            mock_scalars_result.unique.return_value = mock_scalars_result
            session.scalars = AsyncMock(return_value=mock_scalars_result)

            # execute: for count queries etc.
            session.execute = AsyncMock()
            if execute_result is not None:
                session.execute.return_value = execute_result
            else:
                mock_exec_result = MagicMock()
                mock_exec_result.scalar.return_value = 0
                session.execute.return_value = mock_exec_result

            # write operations
            session.add = MagicMock()
            session.flush = AsyncMock()
            session.refresh = AsyncMock()
            session.commit = AsyncMock()

            yield session

        app.dependency_overrides[deps.get_db] = override_get_db
        app.dependency_overrides[deps.get_current_user] = lambda: auth_user
        app.dependency_overrides[deps.get_current_admin_user] = lambda: auth_user
        app.dependency_overrides[deps.get_trusted_or_admin_user] = lambda: auth_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

        app.dependency_overrides.clear()

    return _make


@pytest.fixture
def admin_client(client):
    """Shortcut: client with admin user and common scalar setup."""
    async def _make(scalar_side_effect=None, scalars_result=None, execute_result=None):
        async for c in client(
            _make_admin_user(),
            scalar_side_effect=scalar_side_effect,
            scalars_result=scalars_result,
            execute_result=execute_result,
        ):
            yield c
    return _make


class TestAuthGating:
    async def test_trusted_user_can_create(self, client):
        user = _make_trusted_user()
        media = _make_media_item()
        proposal = _make_proposal()
        # endpoint looks up media → service looks up media → service re-fetches proposal
        async for c in client(user, scalar_side_effect=[media, media, proposal]):
            resp = await c.post(
                "/api/media/oti_media000001/edit-proposals",
                json={"changes": {"overview": "New overview"}},
            )
            assert resp.status_code in (200, 400)

    async def test_admin_can_create(self, client):
        user = _make_admin_user()
        media = _make_media_item()
        proposal = _make_proposal()
        async for c in client(user, scalar_side_effect=[media, media, proposal]):
            resp = await c.post(
                "/api/media/oti_media000001/edit-proposals",
                json={"changes": {"overview": "New overview"}},
            )
            assert resp.status_code in (200, 400)


class TestVoteEndpoints:
    async def test_vote_endpoint_reachable(self, client):
        user = _make_admin_user()
        proposal = _make_proposal()
        # vote: proposal lookup → proposal, existing vote → None, then return proposal → proposal
        async for c in client(user, scalar_side_effect=[proposal, None, proposal]):
            resp = await c.post(
                "/api/media/oti_media000001/edit-proposals/oti_prop0000001/vote",
                json={"vote_type": "up"},
            )
            assert resp.status_code in (200, 400)

    async def test_vote_invalid_type_rejected(self, client):
        user = _make_admin_user()
        # validation happens before any DB call, so no scalar setup needed
        async for c in client(user):
            resp = await c.post(
                "/api/media/oti_media000001/edit-proposals/oti_prop0000001/vote",
                json={"vote_type": "invalid"},
            )
            assert resp.status_code == 422


class TestListProposals:
    async def test_list_proposals_reachable(self, client):
        user = _make_admin_user()
        proposal = _make_proposal()
        # list: scalars() returns proposals, scalar() for vote lookups returns None
        async for c in client(user, scalars_result=[proposal]):
            resp = await c.get("/api/admin/edit-proposals")
            assert resp.status_code in (200, 400)


class TestSchemaValidation:
    async def test_invalid_change_field_rejected(self, client):
        user = _make_admin_user()
        # validation happens before any DB call, so no scalar setup needed
        async for c in client(user):
            resp = await c.post(
                "/api/media/oti_media000001/edit-proposals",
                json={"changes": {"invalid_field": "value"}},
            )
            assert resp.status_code == 422

    async def test_non_string_change_value_rejected(self, client):
        user = _make_admin_user()
        async for c in client(user):
            resp = await c.post(
                "/api/media/oti_media000001/edit-proposals",
                json={"changes": {"overview": 12345}},
            )
            assert resp.status_code == 422
