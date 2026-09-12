from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from otix.api.router import api_router
from otix.domain.media import GameSaveOfficialPath, MediaItem
from otix.domain.user import User


def _make_app():
    app = FastAPI()
    app.include_router(api_router)
    return app


@pytest.fixture
def mock_db():
    session = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.fixture
def current_user():
    user = User(email="test@example.com", username="testuser", hashed_password="pwd")
    user.id = "user-123"
    return user


@pytest.fixture
def app(mock_db, current_user):
    app = _make_app()
    from otix.api import deps

    async def override_get_db():
        try:
            yield mock_db
            await mock_db.commit()
        except Exception:
            await mock_db.rollback()
            raise

    app.dependency_overrides[deps.get_db] = override_get_db
    app.dependency_overrides[deps.get_current_user] = lambda: current_user
    app.dependency_overrides[deps.get_optional_user] = lambda: current_user
    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_get_save_locations_game_not_found(app, mock_db):
    # Mocking MediaItem scalar check to return None (not found)
    mock_db.scalar.return_value = None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/saves/locations/oti_invalid")
        assert resp.status_code == 404
        assert "Game not found." in resp.json()["detail"]


@pytest.mark.anyio
async def test_get_save_locations_success(app, mock_db):
    game = MediaItem(title="Hollow Knight")
    game.id = "oti_hollow_knight"

    official = GameSaveOfficialPath(
        game_id="oti_hollow_knight", platform="windows", path_pattern="path-1", is_verified=True
    )

    # Mock DB queries
    async def mock_scalar(stmt):
        return game

    mock_db.scalar.side_effect = mock_scalar

    # Mock db.scalars() for official paths
    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [official]
    mock_db.scalars.return_value = mock_scalars_result

    # Mock db.execute() for suggested path aggregates
    mock_row = MagicMock()
    mock_row.platform = "windows"
    mock_row.path_pattern = "path-2"
    mock_row.count = 2
    mock_exec_result = MagicMock()
    mock_exec_result.all.return_value = [mock_row]
    mock_db.execute.return_value = mock_exec_result

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/saves/locations/oti_hollow_knight")
        assert resp.status_code == 200
        data = resp.json()
        assert data["game_id"] == "oti_hollow_knight"
        assert len(data["verified"]) == 1
        assert data["verified"][0]["platform"] == "windows"
        assert data["verified"][0]["path_pattern"] == "path-1"
        assert data["verified"][0]["is_verified"] is True
        assert len(data["suggested"]) == 1
        assert data["suggested"][0]["platform"] == "windows"
        assert data["suggested"][0]["path_pattern"] == "path-2"
        assert data["suggested"][0]["count"] == 2


@pytest.mark.anyio
async def test_suggest_save_location_success_no_consensus(app, mock_db):
    game = MediaItem(title="Hollow Knight")
    game.id = "oti_hollow_knight"

    # We need scalar checks for:
    # 1. MediaItem check
    # 2. Existing suggestion check
    # 3. Consensus count count_stmt
    queries = []

    async def mock_scalar_side_effect(stmt):
        queries.append(stmt)
        if len(queries) == 1:
            return game
        elif len(queries) == 2:
            return None  # no existing suggestion
        elif len(queries) == 3:
            return 1  # count count_stmt = 1
        return None

    mock_db.scalar.side_effect = mock_scalar_side_effect

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"platform": "windows", "path_pattern": "%USERPROFILE%/AppData/LocalLow/Team Cherry"}
        resp = await client.post("/saves/locations/oti_hollow_knight/suggest", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["suggestion_count"] == 1
        assert data["promoted_to_official"] is False

    assert mock_db.commit.call_count == 2


@pytest.mark.anyio
async def test_suggest_save_location_consensus_promoted(app, mock_db):
    game = MediaItem(title="Hollow Knight")
    game.id = "oti_hollow_knight"

    # We need scalar checks for:
    # 1. MediaItem check
    # 2. Existing suggestion check
    # 3. Consensus count count_stmt (returns 3)
    # 4. Existing official path check
    queries = []

    async def mock_scalar_side_effect(stmt):
        queries.append(stmt)
        if len(queries) == 1:
            return game
        elif len(queries) == 2:
            return None  # no existing suggestion
        elif len(queries) == 3:
            return 3  # count = 3
        elif len(queries) == 4:
            return None  # no existing official path
        return None

    mock_db.scalar.side_effect = mock_scalar_side_effect

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"platform": "windows", "path_pattern": "%USERPROFILE%/AppData/LocalLow/Team Cherry"}
        resp = await client.post("/saves/locations/oti_hollow_knight/suggest", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["suggestion_count"] == 3
        assert data["promoted_to_official"] is True

    assert mock_db.commit.call_count == 2
