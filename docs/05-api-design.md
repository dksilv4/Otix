# API Design

## Approach

**Code-first, not spec-first.** FastAPI + Pydantic generates the OpenAPI spec automatically. No hand-authored YAML.

```
FastAPI route → Pydantic schema → /openapi.json → openapi-typescript → @otix/api-client
```

The TypeScript client is a build artifact. If backend schemas change, the frontend fails to compile. This catches API contract mismatches at build time, not runtime.

---

## Layered Architecture

```
┌─────────────────────────────────────────────┐
│  api/                                        │
│  Routes: HTTP concerns only                  │
│  - Parse path/query/body params              │
│  - Set status codes, headers                 │
│  - Call service methods                      │
│  - Return Pydantic response models           │
├─────────────────────────────────────────────┤
│  services/                                   │
│  Business logic: no HTTP awareness           │
│  - Orchestrate domain operations             │
│  - Validate business rules                   │
│  - Coordinate across providers               │
│  - Raise domain exceptions                   │
├─────────────────────────────────────────────┤
│  domain/                                     │
│  Data access: SQLAlchemy queries             │
│  - Pure ORM models                           │
│  - No HTTP, no business logic                │
│  - Query methods, relationship loading       │
└─────────────────────────────────────────────┘
```

### Why Three Layers

- **Routes** can be tested with `TestClient` without a database
- **Services** can be tested with mocked domain models
- **Domain** can be tested with a real database and no HTTP stack
- A service never imports `fastapi`. A domain model never imports anything from `services/` or `api/`.

---

## Endpoint Catalog

### Auth (`/auth`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Return access token + set refresh cookie |
| POST | `/auth/refresh` | Exchange refresh cookie for new access token |
| POST | `/auth/logout` | Revoke refresh token, clear cookie |
| POST | `/auth/verify-email` | Verify email with token |
| GET | `/auth/me` | Current user profile |

### Media (`/media`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/media/{type}/{id}` | Full media detail with relations |
| GET | `/media/{type}` | Paginated list, filterable |
| GET | `/media/{type}/{id}/credits` | Cast and crew |
| GET | `/media/{type}/{id}/seasons/{n}` | Season detail with episodes |
| GET | `/media/{type}/{id}/similar` | Similar media |
| GET | `/media/{type}/{id}/providers` | Watch/play availability |

### User (`/user`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/user/{id}` | Public profile |
| GET | `/user/{id}/interactions` | Ratings, watchlist, etc. |
| POST | `/user/{id}/interactions` | Add/update interaction |
| DELETE | `/user/{id}/interactions/{type}` | Remove interaction |
| GET | `/user/{id}/watchlist` | Watchlist with media details |

### Discover (`/discover`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/discover/trending` | Trending media |
| GET | `/discover/popular` | Popular by genre/type |
| GET | `/discover/recommendations` | Personalized (requires auth) |
| GET | `/discover/upcoming` | Upcoming releases |

### Search (`/search`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/search` | Full-text search with filters |

### Sync (`/sync`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/sync/status` | Active and recent sync jobs |
| POST | `/sync/trigger` | Manually trigger a sync |
| GET | `/sync/providers` | Provider health and rate limit status |

---

## Schema Design Patterns

### Discriminated Union for Media Types

```python
from pydantic import BaseModel, Field
from typing import Literal, Union
from uuid import UUID

class MovieFields(BaseModel):
    media_type: Literal["movie"] = "movie"
    runtime: int | None
    budget: int | None
    revenue: int | None
    tagline: str | None
    is_anime: bool

class ShowFields(BaseModel):
    media_type: Literal["show"] = "show"
    status: str | None
    first_air_date: date | None
    last_air_date: date | None
    number_of_seasons: int
    number_of_episodes: int

class GameFields(BaseModel):
    media_type: Literal["game"] = "game"
    release_status: str | None
    steam_app_id: int | None
    platforms: list[str]
    has_multiplayer: bool

MediaTypeFields = Union[MovieFields, ShowFields, GameFields]

class MediaDetailResponse(BaseModel):
    id: UUID
    title: str
    overview: str | None
    poster_url: str | None
    backdrop_url: str | None
    release_date: date | None
    popularity: float
    genres: list[GenreResponse]
    credits: list[CreditResponse]
    external_ratings: list[ExternalRatingResponse]
    type_specific: MediaTypeFields = Field(discriminator="media_type")
```

### Pagination

```python
class PaginationParams(BaseModel):
    cursor: str | None = None
    limit: int = Field(default=20, le=100)

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    total: int | None = None  # Only when cheap to compute
```

### Error Responses

```python
class ErrorResponse(BaseModel):
    detail: str
    code: str           # Machine-readable: 'media_not_found', 'rate_limited'
    field: str | None   # For validation errors

# Standard HTTP status codes:
# 400 - Validation error (Pydantic generates these automatically)
# 401 - Missing or expired access token
# 403 - Authenticated but not authorized
# 404 - Resource not found
# 429 - Rate limited
# 500 - Unexpected server error
```

---

## Auth Flow

### Login

```
POST /auth/login { email, password }
  → Server validates credentials
  → Returns { access_token: "<jwt>", expires_in: 900 }
  → Sets refresh_token cookie: HTTP-only, SameSite=Lax, Path=/auth/refresh, Max-Age=604800
```

### Authenticated Requests

```
Authorization: Bearer <access_token>
  → FastAPI dependency decodes JWT, loads user from DB
  → Injects User into route handler
```

### Silent Refresh

```
Client interceptor on 401:
  1. POST /auth/refresh (cookie sent automatically)
  2. If success → store new access token, retry original request
  3. If failure → redirect to /auth/login
```

### Token Storage

| Token | Location | Accessible to JS | Purpose |
|---|---|---|---|
| access_token | JS closure variable | Yes (in memory only) | API auth header |
| refresh_token | HTTP-only cookie | No | Obtaining new access tokens |

This means:
- XSS can steal the access token (mitigated by 15-minute lifetime)
- XSS cannot steal the refresh token (HTTP-only cookie)
- CSRF is irrelevant (the access token is in an `Authorization` header, not a cookie; the refresh cookie is SameSite=Lax and only sent to `/auth/refresh`)

---

## API Client Generation

```bash
# Backend generates OpenAPI spec at runtime
curl http://localhost:8000/openapi.json > openapi.json

# Generate TypeScript client
npx openapi-typescript openapi.json -o packages/@otix/api-client/src/index.ts
```

The generated client provides:
- Type-safe request parameters (path, query, body)
- Type-safe response types
- No manual case conversion — the generator handles Python snake_case → TS camelCase mapping
- Request/response types are a compile-time check between frontend and backend

### CI Integration

```yaml
# GitHub Actions — openapi-check.yml
- name: Generate OpenAPI from backend
  run: docker compose up -d api && curl --retry 10 http://localhost:8000/openapi.json > openapi.json
- name: Generate TypeScript client
  run: npx openapi-typescript openapi.json -o packages/@otix/api-client/src/index.ts
- name: Check for diffs
  run: git diff --exit-code -- packages/@otix/api-client/
```

If a backend PR changes the API without updating the generated client, CI fails.
