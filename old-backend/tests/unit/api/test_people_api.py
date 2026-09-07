from unittest.mock import AsyncMock, MagicMock, patch
import json
import pytest
from httpx import ASGITransport, AsyncClient

from otix.schemas.people import PersonDetail

def _make_app():
    from fastapi import FastAPI
    from otix.api.router import api_router
    app = FastAPI()
    app.include_router(api_router)
    return app

class MockPerson:
    def __init__(self):
        self.id = "test_person_id"
        self.name = "John Doe"
        self.tmdb_id = 123
        self.imdb_id = "nm123"
        self.photo_url = "http://example.com/photo.jpg"
        self.biography = "A great actor."
        self.birthday = None
        self.deathday = None
        self.place_of_birth = "New York"
        self.credits = []
        self._external_ids = []
        self.follower_count = 10
        self.avg_rating = 4.5
        self.user_rating = None
        self.is_followed = None
        self.rating_count = 5

@pytest.fixture
def mock_db():
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    session.get = AsyncMock(return_value=None)
    session.execute = AsyncMock(return_value=MagicMock())
    return session

@pytest.fixture
def mock_redis():
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=None)
    mock_client.set = AsyncMock()
    mock_client.delete = AsyncMock()
    
    with patch("otix.api.people.detail.router.get_redis", return_value=mock_client), \
         patch("otix.infrastructure.redis.get_redis", return_value=mock_client):
        yield mock_client

@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = "test_user_id"
    return user

@pytest.fixture
def app(mock_db, mock_user):
    app = _make_app()
    from otix.api import deps

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[deps.get_db] = override_get_db
    app.dependency_overrides[deps.get_optional_user] = lambda: mock_user
    app.dependency_overrides[deps.get_current_user] = lambda: mock_user
    yield app
    app.dependency_overrides.clear()

@pytest.mark.anyio
async def test_get_person_cache_miss(app, mock_db, mock_redis):
    mock_person = MockPerson()

    with patch("otix.api.people.detail.router.PeopleService") as MockService:
        mock_service_instance = AsyncMock()
        mock_service_instance.get_person = AsyncMock(return_value=mock_person)
        MockService.return_value = mock_service_instance

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/person/test_person_id")
            assert resp.status_code == 200
            data = resp.json()
            assert data["name"] == "John Doe"
            assert data["id"] == "test_person_id"
            
            # Verify set was called to cache public data
            mock_redis.set.assert_called_once()
            cache_key, cached_val = mock_redis.set.call_args[0]
            assert cache_key == "person:detail:test_person_id"
            cached_detail = json.loads(cached_val)
            assert cached_detail["name"] == "John Doe"
            assert cached_detail["is_followed"] is None
            assert cached_detail["user_rating"] is None

@pytest.mark.anyio
async def test_get_person_cache_hit_and_patch(app, mock_db, mock_redis):
    # Prepare cached public data
    cached_data = {
        "id": "test_person_id",
        "name": "Cached John",
        "follower_count": 5,
        "is_followed": None,
        "user_rating": None,
        "credits": []
    }
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_data))

    # Mock DB lookups for dynamic patching of follows and ratings
    mock_db.scalar = AsyncMock(side_effect=[
        MagicMock(),  # follow check returns something (is_followed = True)
        4,           # user rating check returns 4
    ])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/person/test_person_id")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Cached John"
        assert data["is_followed"] is True
        assert data["user_rating"] == 4

        # Verify DB queries were made for patching
        assert mock_db.scalar.call_count == 2

@pytest.mark.anyio
async def test_follow_person_invalidates_cache(app, mock_db, mock_redis):
    # Mock person check in DB
    mock_person = MagicMock()
    mock_db.get = AsyncMock(side_effect=[
        mock_person,  # db.get(Person, person_id) in follow router
        None,         # existing follow check
    ])
    mock_db.scalar = AsyncMock(return_value=1) # count check

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/person/test_person_id/follow")
        assert resp.status_code == 200
        
        # Verify redis.delete was called to invalidate the cache
        mock_redis.delete.assert_called_once_with("person:detail:test_person_id")

@pytest.mark.anyio
async def test_rate_person_invalidates_cache(app, mock_db, mock_redis):
    # Mock person check in DB
    mock_person = MagicMock()
    mock_db.get = AsyncMock(return_value=mock_person)

    with patch("otix.api.people.rating.router.PeopleService") as MockService:
        mock_service_instance = AsyncMock()
        mock_service_instance.rate_person = AsyncMock()
        MockService.return_value = mock_service_instance

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.put("/person/test_person_id/rating", json={"score": 4})
            assert resp.status_code == 204
            
            # Verify redis.delete was called to invalidate the cache
            mock_redis.delete.assert_called_once_with("person:detail:test_person_id")
