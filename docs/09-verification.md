# Verification Plan

## Test Levels

| Level | Scope | Tools | Run Time |
|---|---|---|---|
| Unit | Single function/class | pytest + pytest-asyncio | < 5s |
| Integration | Service + database | pytest + testcontainers | < 30s |
| Contract | API response shapes | pytest + openapi-spec-validator | < 1min |
| E2E | Full user flows | Playwright | < 5min |
| Performance | Load testing | k6 | 10min |

---

## Unit Tests

### Services

```python
# tests/unit/test_auth_service.py
async def test_register_creates_user_and_returns_tokens():
    service = AuthService(mock_db, mock_redis)
    result = await service.register("test@example.com", "securepassword123")
    assert result.access_token is not None
    assert result.refresh_token is not None

async def test_login_with_wrong_password_raises():
    service = AuthService(mock_db, mock_redis)
    with pytest.raises(InvalidCredentialsError):
        await service.login("test@example.com", "wrongpassword")

async def test_refresh_with_expired_token_raises():
    service = AuthService(mock_db, mock_redis)
    with pytest.raises(TokenExpiredError):
        await service.refresh("expired_refresh_token")
```

### Rate Limiter

```python
async def test_token_bucket_allows_up_to_burst():
    limiter = RateLimiter(mock_redis, "test", rps=10, burst=5)
    for _ in range(5):
        assert await limiter.acquire() is True
    assert await limiter.acquire() is False

async def test_token_bucket_refills_over_time():
    limiter = RateLimiter(mock_redis, "test", rps=100, burst=1)
    assert await limiter.acquire() is True
    assert await limiter.acquire() is False
    await asyncio.sleep(0.02)
    assert await limiter.acquire() is True
```

---

## Integration Tests

### Database

```python
# tests/integration/test_media_service.py
async def test_create_media_item_with_relations(db_session: AsyncSession):
    service = MediaService(db_session)
    media = await service.create_media_item(
        media_type="movie",
        title="Fight Club",
        genres=[{"name": "Drama"}, {"name": "Thriller"}],
        external_ids=[{"provider": "tmdb", "external_id": "550"}],
    )
    assert media.id is not None
    assert media.media_type == "movie"
    assert len(media.genres) == 2

    # Verify external_id lookup
    found = await service.find_by_external_id("tmdb", "550")
    assert found.id == media.id

async def test_user_interaction_upsert(db_session: AsyncSession):
    service = UserService(db_session)
    await service.add_interaction(user_id, media_id, "rated", {"rating": 8})
    await service.add_interaction(user_id, media_id, "rated", {"rating": 9})
    interactions = await service.get_interactions(user_id, media_id)
    assert interactions["rated"]["rating"] == 9
```

### Sync Pipeline

```python
async def test_tmdb_movie_sync_populates_all_relations(db_session, tmdb_mock):
    service = SyncService(db_session, tmdb_provider)
    job = await service.sync_entity("tmdb", "movie", "550")
    assert job.status == "completed"

    media = await MediaService(db_session).find_by_external_id("tmdb", "550")
    assert media.title == "Fight Club"
    assert len(media.genres) > 0
    assert len(media.credits) > 0
```

---

## Contract Tests

Ensure the OpenAPI spec matches actual responses:

```python
from openapi_spec_validator import validate_response

async def test_media_detail_matches_openapi_spec(client, openapi_spec):
    response = await client.get("/media/movie/550")
    assert response.status_code == 200
    validate_response(response.json(), openapi_spec, "/media/{media_type}/{media_id}", "get")

async def test_error_responses_match_schema(client, openapi_spec):
    response = await client.get("/media/movie/99999999")
    assert response.status_code == 404
    validate_response(response.json(), openapi_spec, "/media/{media_type}/{media_id}", "get")
```

---

## End-to-End Tests (Playwright)

### Auth Flow

```
1. Navigate to /auth/register
2. Fill form, submit
3. Verify redirect to /
4. Refresh page → still authenticated (access token in memory survives reloads)
5. Click logout
6. Verify redirect to /auth/login
7. Try to access / → redirected to /auth/login
```

### Media Detail

```
1. Login
2. Navigate to /media/movie/550
3. Verify title, poster, genres are visible
4. Verify cast section renders
5. Click "Rate" → select 8 stars
6. Refresh page → rating persists
```

### Discover

```
1. Login
2. Navigate to /discover/trending
3. Verify media grid renders
4. Apply genre filter
5. Verify results update
6. Refresh page → cached results render instantly, then update
```

### Search

```
1. Type "Fight Club" in search
2. Verify results appear
3. Click result → navigates to media detail
```

---

## Performance Benchmarks

| Scenario | Target | Measurement |
|---|---|---|
| Media detail (cold) | p95 < 200ms | k6 — 100 concurrent users |
| Media detail (cached) | p95 < 50ms | Redis cache hit |
| Search (full-text) | p95 < 300ms | GIN index scan |
| Discover feed | p95 < 500ms | Composite query |
| TMDB movie sync (single) | p95 < 3s | End-to-end with relations |
| Full catalog hydration | < 4 hours | 100K entities |
| Auth: login | p95 < 200ms | bcrypt verify |
| Auth: refresh | p95 < 100ms | JWT decode + Redis lookup |

### k6 Load Test Script

```javascript
import { check } from "k6";
import http from "k6/http";

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // Ramp up
    { duration: "1m", target: 100 },   // Sustained load
    { duration: "30s", target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/media/movie/550`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  check(res, { "status is 200": (r) => r.status === 200 });
}
```

---

## Acceptance Checklist

### Auth
- [ ] Register → verify email → login → 401 → refresh → retry → logout → session revoked
- [ ] Refresh token rotation: each refresh invalidates the previous refresh token
- [ ] Access token expires in 15 minutes
- [ ] Refresh token expires in 7 days

### Sync
- [ ] TMDB movie sync → all relations populated → completeness score computed → dedup works
- [ ] TMDB show sync → seasons → episodes → full hierarchy populated
- [ ] Steam game sync → platforms, modes, CCU counts
- [ ] IGDB game sync → merges with Steam data by external ID
- [ ] Fanart hydration → images attached to correct media
- [ ] Circuit breaker opens after 5 consecutive provider failures
- [ ] Rate limiter prevents 429s during full catalog sync

### API Contract
- [ ] FastAPI generates valid OpenAPI 3.1 spec
- [ ] `openapi-typescript` generates client with zero type errors
- [ ] CI fails if API changes without regenerating client
- [ ] All endpoints return documented response shapes
- [ ] Error responses match the ErrorResponse schema

### Data Migration
- [ ] Row counts match between Django and new schema
- [ ] 100 random entities spot-checked — all fields match
- [ ] Checksums computed across all tables — verified
- [ ] Migration script is idempotent
- [ ] Migration completes in < 4 hours on production-sized data

### Frontend
- [ ] All routes render with new data layer
- [ ] Auth guards redirect unauthenticated users
- [ ] Discover persistence: stale data renders instantly, fresh data replaces it
- [ ] Sync status updates in real-time via SSE
- [ ] TypeScript compilation: zero errors, strict mode

### Infrastructure
- [ ] Docker Compose starts all services with `make up`
- [ ] CI pipeline passes: lint, type-check, unit tests, integration tests
- [ ] Health check endpoint returns 200 for all services
- [ ] Prometheus metrics endpoint exposes request counts, latency, error rates

### Rate Limiting
- [ ] Full catalog sync completes with 0 provider 429s
- [ ] Circuit breaker opens on sustained failures
- [ ] Circuit breaker half-opens and recovers when provider is healthy

### Regression
- [ ] Shadow traffic comparison: 1 week, response parity within 1% tolerance
- [ ] No data loss: all user interactions survive migration
- [ ] No downtime during cutover > 5 minutes
