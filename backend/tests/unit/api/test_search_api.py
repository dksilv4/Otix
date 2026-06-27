from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


def _make_app():
    from fastapi import FastAPI

    from otix.api.router import api_router

    app = FastAPI()
    app.include_router(api_router)
    return app


def _mock_db():
    session = AsyncMock()
    session.scalars = AsyncMock(return_value=[])
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
    from otix.api import deps

    async def override_get_db():
        yield _mock_db()

    app.dependency_overrides[deps.get_db] = override_get_db
    app.dependency_overrides[deps.get_optional_user] = lambda: None
    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
@patch("otix.api.media._embed_query")
@patch("otix.api.media.MediaService.search_media")
async def test_search_endpoint_passes_embedding(mock_search_media, mock_embed_query, app):
    # Mock return values
    embedding = [0.1] * 1024
    mock_embed_query.return_value = embedding

    items = []
    mock_search_media.return_value = (items, 0, False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/media/search?q=inception&media_type=movie")
        assert resp.status_code == 200

        data = resp.json()
        assert "items" in data
        assert "has_more" in data
        assert "total" in data

        # Verify embedding generation and search invocation
        mock_embed_query.assert_called_once_with("inception")
        mock_search_media.assert_called_once_with(
            query_str="inception",
            media_type="movie",
            sort_by=None,
            page=1,
            page_size=24,
            query_embedding=embedding,
            exclude_adult=True,
        )


@pytest.mark.anyio
@patch("otix.api.media._embed_query")
@patch("otix.api.media.MediaService.search_media")
async def test_search_poll_endpoint_passes_embedding(mock_search_media, mock_embed_query, app):
    embedding = [0.2] * 1024
    mock_embed_query.return_value = embedding
    mock_search_media.return_value = ([], 0, False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/media/search/poll?q=inception&media_type=movie")
        assert resp.status_code == 200

        data = resp.json()
        assert "items" in data
        assert "has_more" in data
        assert "total" in data

        # Verify embedding and search media invocation in polling endpoint
        mock_embed_query.assert_called_once_with("inception")
        mock_search_media.assert_called_once_with(
            query_str="inception",
            media_type="movie",
            page=1,
            page_size=24,
            query_embedding=embedding,
            exclude_adult=True,
        )
