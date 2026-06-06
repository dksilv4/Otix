from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from otix.domain.media import MediaItem


def _make_app():
    from fastapi import FastAPI
    from otix.api.router import api_router

    app = FastAPI()
    app.include_router(api_router)
    return app


def _mock_db():
    session = AsyncMock()
    item1 = MediaItem(
        id="m-1",
        media_type="movie",
        title="Inception",
        slug="inception",
        popularity=100.0,
        is_adult=False,
        completeness_score=1.0,
        rating_count=0,
        like_count=0,
        watchlist_count=0,
        watched_count=0,
        played_count=0,
        started_count=0,
        listened_count=0,
        view_count=0,
    )
    item2 = MediaItem(
        id="g-2",
        media_type="game",
        title="Inception Game",
        slug="inception-game",
        popularity=80.0,
        is_adult=False,
        completeness_score=1.0,
        rating_count=0,
        like_count=0,
        watchlist_count=0,
        watched_count=0,
        played_count=0,
        started_count=0,
        listened_count=0,
        view_count=0,
    )

    # Mocking db.scalars to return a list of MediaItems
    session.scalars = AsyncMock(return_value=[item1, item2])
    session.scalar = AsyncMock(return_value=None)
    session.execute = AsyncMock()
    return session


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
    app = _make_app()
    from otix.api import _utils as deps

    async def override_get_db():
        yield _mock_db()

    app.dependency_overrides[deps.get_db] = override_get_db
    app.dependency_overrides[deps.get_optional_user] = lambda: None
    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_search_suggestions_endpoint(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/media/suggestions?q=incep")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2
        assert data[0]["title"] == "Inception"
        assert data[0]["media_type"] == "movie"
        assert data[1]["title"] == "Inception Game"
        assert data[1]["media_type"] == "game"
