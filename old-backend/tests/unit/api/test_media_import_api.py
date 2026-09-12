from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


def _make_app():
    from fastapi import FastAPI

    from otix.api.media.search import media_router

    app = FastAPI()
    app.include_router(media_router, prefix="/media")
    return app


@pytest.fixture
def app():
    from otix.api import deps

    app = _make_app()
    app.dependency_overrides[deps.get_current_user] = lambda: {"id": "user_1"}
    yield app
    app.dependency_overrides.clear()


def _mock_session_with_item(item=None):
    session = AsyncMock()
    session.get = AsyncMock(return_value=item)
    return session


def _mock_async_session(session):
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=session)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


@pytest.mark.anyio
@patch("otix.api.media.search.async_session")
@patch("otix.tasks.sync.tmdb._sync_tmdb_media")
async def test_import_tmdb_movie(mock_sync, mock_async_session, app):
    mock_sync.return_value = {"otix_id": "mi_1", "title": "Inception", "tmdb_id": 157336}
    item = MagicMock()
    item.slug = "inception"
    mock_async_session.return_value = _mock_async_session(_mock_session_with_item(item))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/media/import",
            json={"provider": "tmdb", "provider_id": "157336", "media_type": "movie"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["media_id"] == "mi_1"
    assert data["title"] == "Inception"
    assert data["slug"] == "inception"
    assert data["provider"] == "tmdb"
    assert data["provider_id"] == "157336"
    mock_sync.assert_called_once_with(157336, "movie")


@pytest.mark.anyio
@patch("otix.api.media.search.async_session")
@patch("otix.tasks.sync.igdb._sync_igdb_game")
async def test_import_igdb_game(mock_sync, mock_async_session, app):
    mock_sync.return_value = {"otix_id": "mi_2", "title": "Portal 2", "igdb_id": 2280}
    item = MagicMock()
    item.slug = "portal-2"
    mock_async_session.return_value = _mock_async_session(_mock_session_with_item(item))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/media/import", json={"provider": "igdb", "provider_id": "2280"})

    assert resp.status_code == 200
    assert resp.json()["media_id"] == "mi_2"
    mock_sync.assert_called_once_with(2280, force=True)


@pytest.mark.anyio
@patch("otix.tasks.sync.tmdb._sync_tmdb_media")
async def test_import_tmdb_requires_media_type(mock_sync, app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/media/import", json={"provider": "tmdb", "provider_id": "157336"})

    assert resp.status_code == 400
    mock_sync.assert_not_called()


@pytest.mark.anyio
async def test_import_unknown_provider(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/media/import",
            json={"provider": "plex", "provider_id": "1", "media_type": "movie"},
        )

    assert resp.status_code == 400


@pytest.mark.anyio
@patch("otix.api.media.search.async_session")
@patch("otix.api.media.search.ExternalIDService")
@patch("otix.tasks.sync.tmdb._sync_tmdb_media")
async def test_import_returns_existing_when_sync_empty(mock_sync, mock_eid, mock_async_session, app):
    mock_sync.return_value = None
    ext_id = MagicMock()
    ext_id.entity_id = "mi_existing"
    ext_id.media_item_id = None
    eid_svc = MagicMock()
    eid_svc.get_by_provider_ext_id = AsyncMock(return_value=ext_id)
    mock_eid.return_value = eid_svc

    item = MagicMock()
    item.id = "mi_existing"
    item.title = "Inception"
    item.slug = "inception"
    mock_async_session.return_value = _mock_async_session(_mock_session_with_item(item))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/media/import",
            json={"provider": "tmdb", "provider_id": "157336", "media_type": "movie"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["media_id"] == "mi_existing"
    assert data["title"] == "Inception"
