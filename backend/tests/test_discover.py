from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from otix.api.discover import VALID_LIST_TYPES, VALID_MEDIA_TYPES


def _make_app():
    from fastapi import FastAPI

    from otix.api.router import api_router

    app = FastAPI()
    app.include_router(api_router)
    return app


def _mock_db():
    """Return an AsyncMock that looks like an AsyncSession."""
    session = AsyncMock()
    session.scalars = AsyncMock(return_value=[])
    session.scalar = AsyncMock(return_value=None)
    session.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))))
    session.get = AsyncMock(return_value=None)
    return session


@pytest.fixture(autouse=True)
def mock_redis():
    with patch("otix.api.discover.get_redis") as mock_get:
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
async def test_discover_hero_returns_ok(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/discover/hero")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "has_more" in data
        assert "next_cursor" in data


@pytest.mark.anyio
@pytest.mark.parametrize("media_type", sorted(VALID_MEDIA_TYPES))
@pytest.mark.parametrize("list_type", sorted(VALID_LIST_TYPES))
async def test_discover_list_returns_ok(app, media_type, list_type):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(f"/discover/{media_type}/{list_type}")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "has_more" in data
        assert "next_cursor" in data


@pytest.mark.anyio
async def test_discover_rejects_invalid_media_type(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/discover/invalid/trending")
        assert resp.status_code == 400


@pytest.mark.anyio
async def test_discover_rejects_invalid_list_type(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/discover/movie/invalid")
        assert resp.status_code == 400


# ── trending trailers ──────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_trending_trailers_returns_ok(app):
    """GET /discover/trailers/trending returns 200 with expected paginated shape."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/discover/trailers/trending")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "has_more" in data
        assert "next_cursor" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert data["has_more"] is False
        assert data["next_cursor"] is None
        assert data["total"] == 0


@pytest.mark.anyio
async def test_trending_trailers_accepts_limit(app):
    """GET /discover/trailers/trending?limit=X still returns 200."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/discover/trailers/trending", params={"limit": 5})
        assert resp.status_code == 200


# ── _extract_youtube_id ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"),
        ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),  # already an ID
        # New edge cases
        (None, ""),                         # None input
        ("", ""),                           # empty string
        ("   ", ""),                        # whitespace-only → falsy
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),  # embed URL
        ("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1", "dQw4w9WgXcQ"),  # embed with params
        ("https://vimeo.com/123456789", ""),  # non-YouTube URL
        ("https://example.com/video.mp4", ""),  # unknown domain
        ("https://youtube.com/shorts/abc123", ""),  # shorts path (no ?v=)
    ],
)
def test_extract_youtube_id(url, expected):
    from otix.api.discover.trailers.router import _extract_youtube_id

    assert _extract_youtube_id(url) == expected
