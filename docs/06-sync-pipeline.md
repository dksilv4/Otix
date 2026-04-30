# Sync Pipeline

## Overview

The sync pipeline ingests media data from 7 external providers into the Otix catalog. It runs as Celery tasks distributed across 7 queues with prefix-based routing.

## Provider Summary

| Provider | Entity Types | Rate Limit | Data Size |
|---|---|---|---|
| TMDB | Movies, Shows, Seasons, Episodes, People | 50 req/s | ~1M+ movies, ~200K shows |
| Steam | Games, CCU counts | 200 req/5min | ~100K games |
| IGDB | Games, platforms, modes | 4 req/s (free tier) | ~300K games |
| Fanart | Images (posters, backdrops, logos) | None (project key) | Per-media |
| OMDB | Ratings, runtime metadata | 1000/day (free) | Per-media |
| Plex | User libraries, watch state | Per-server | User-dependent |

---

## Queue Architecture

7 queues replacing the current 30:

```python
CELERY_TASK_QUEUES = {
    "critical":  {},  # User-facing syncs (priority 1-3)
    "default":   {},  # General sync tasks (priority 4-6)
    "bulk":      {},  # Catalog hydration, batch sync (priority 7-9)
    "deferred":  {},  # Enrichment, graph fanout, recommendations
    "steam_ccu": {},  # Steam CCU polling (rate-limit isolated)
    "provider":  {},  # External API calls (TMDB, Steam, IGDB, etc.)
    "scheduled": {},  # Celery beat tasks
}
```

### Why Queue Per Concern

- **critical** — User clicked "sync now," expects result in seconds. 2 concurrent workers, no prefetch.
- **default** — Normal sync operations. 4 concurrent workers.
- **bulk** — Back-catalog hydration. 1 worker, low priority, can run for hours.
- **deferred** — Enrichment that fans out from sync (e.g., "get credits for this movie" after the movie itself syncs). 2 workers.
- **steam_ccu** — Steam concurrent user polling runs every 5 minutes and must be rate-limit isolated from other Steam API calls.
- **provider** — All external HTTP calls go through this queue so provider rate limiters apply consistently.
- **scheduled** — Beat tasks. 1 worker.

### Task Routing

```python
def route_task(name, args, kwargs, options, task=None, **kw):
    if name.startswith("otix.tasks.sync.sync_entity"):
        priority = kwargs.get("priority", 5)
        return {"queue": "critical" if priority <= 3 else "default"}

    if name.startswith("otix.tasks.sync.deferred"):
        return {"queue": "deferred"}

    if name.startswith("otix.tasks.catalog"):
        return {"queue": "bulk"}

    if "steam.ccu" in name:
        return {"queue": "steam_ccu"}

    if any(p in name for p in ["tmdb", "steam", "igdb", "fanart", "omdb", "plex"]):
        return {"queue": "provider"}

    return {"queue": "default"}
```

---

## Pipeline Phases

```
┌────────────────────────────────────────────────────┐
│                    CORE PHASE                       │
│  Fetch entity from provider → upsert media_item    │
│  → store external_id → emit graph events           │
├────────────────────────────────────────────────────┤
│                   FANOUT PHASE                      │
│  For each relation discovered in core:             │
│  credits → fetch people → upsert → link            │
│  collection → fetch collection → link items        │
│  seasons → fetch season → fetch episodes           │
├────────────────────────────────────────────────────┤
│                 ENRICHMENT PHASE                    │
│  Hydrate cross-provider data:                      │
│  Fanart images → OMDB ratings → Steam CCU          │
│  → compute completeness_score                      │
└────────────────────────────────────────────────────┘
```

### Phase Example: TMDB Movie Sync

```
1. [CORE] User requests movie 550 (Fight Club)
   → GET /movie/550 from TMDB
   → Upsert media_items + movies row
   → INSERT external_ids (provider='tmdb', external_id='550')
   → Emit events: {credits: [...], collection: 123, images: [...]}

2. [FANOUT] Process credits
   → For each credit: GET /person/{id} from TMDB
   → Upsert people + media_credits rows

3. [FANOUT] Process collection
   → GET /collection/123 from TMDB
   → Upsert collection, link movies

4. [ENRICHMENT] Hydrate from other providers
   → Fanart: fetch images by TMDB ID
   → OMDB: fetch ratings by IMDB ID
   → Compute completeness_score: 0.85
```

---

## Provider Integration Pattern

Every provider implements three classes:

```python
class BaseProvider(ABC):
    """HTTP client for an external API."""

    def __init__(self, http_client: httpx.AsyncClient, rate_limiter: RateLimiter):
        self.client = http_client
        self.rate_limiter = rate_limiter

    @abstractmethod
    async def fetch_entity(self, external_id: str) -> dict: ...

    @abstractmethod
    async def fetch_changed_ids(self, since: datetime) -> list[str]: ...


class BaseTransformer(ABC):
    """Maps provider-specific data to internal domain models."""

    @abstractmethod
    def to_media_item(self, raw: dict) -> dict: ...

    @abstractmethod
    def to_relations(self, raw: dict) -> list[dict]: ...


class BaseHydrator(ABC):
    """Enriches existing media with cross-provider data."""

    @abstractmethod
    async def hydrate(self, media_item_id: UUID) -> dict: ...
```

### Example: TMDB Provider

```python
class TMDBProvider(BaseProvider):
    BASE_URL = "https://api.themoviedb.org/3"

    async def fetch_entity(self, external_id: str) -> dict:
        await self.rate_limiter.acquire("tmdb")
        response = await self.client.get(f"{self.BASE_URL}/movie/{external_id}")
        response.raise_for_status()
        return response.json()

class TMDBMovieTransformer(BaseTransformer):
    def to_media_item(self, raw: dict) -> dict:
        return {
            "media_type": "movie",
            "title": raw["title"],
            "overview": raw.get("overview"),
            "poster_url": self._image_url(raw.get("poster_path")),
            "backdrop_url": self._image_url(raw.get("backdrop_path")),
            "release_date": raw.get("release_date"),
            "popularity": raw.get("popularity", 0),
            "original_language": raw.get("original_language"),
            # Movie-specific
            "runtime": raw.get("runtime"),
            "budget": raw.get("budget"),
            "revenue": raw.get("revenue"),
            "tagline": raw.get("tagline"),
        }

    def to_relations(self, raw: dict) -> list[dict]:
        relations = []
        for genre in raw.get("genres", []):
            relations.append({"type": "genre", "name": genre["name"]})
        for credit in raw.get("credits", {}).get("cast", []):
            relations.append({
                "type": "credit",
                "person_tmdb_id": credit["id"],
                "role": "cast",
                "character_name": credit.get("character"),
            })
        if raw.get("belongs_to_collection"):
            relations.append({
                "type": "collection",
                "tmdb_id": raw["belongs_to_collection"]["id"],
            })
        return relations
```

---

## Rate Limiting

Token bucket algorithm backed by Redis Lua scripts for atomicity:

```python
class RateLimiter:
    def __init__(self, redis: Redis, key: str, rps: float, burst: int = 1):
        self.redis = redis
        self.key = f"rate_limit:{key}"
        self.rate = rps
        self.burst = burst

    async def acquire(self) -> bool:
        """Returns True if request can proceed."""
        lua_script = """
        local key = KEYS[1]
        local rate = tonumber(ARGV[1])
        local burst = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        local tokens = tonumber(redis.call('GET', key)) or burst
        if tokens > 0 then
            redis.call('SET', key, tokens - 1)
            return 1
        end

        local last_refill = tonumber(redis.call('GET', key .. ':last')) or now
        local elapsed = now - last_refill
        local new_tokens = math.min(burst, tokens + elapsed * rate)
        if new_tokens > 0 then
            redis.call('SET', key, new_tokens - 1)
            redis.call('SET', key .. ':last', now)
            return 1
        end
        return 0
        """
        now = time.time()
        result = await self.redis.eval(lua_script, 1, self.key, self.rate, self.burst, now)
        return bool(result)
```

### Provider Rate Limits

```python
PROVIDER_RATE_LIMITS = {
    "tmdb":    RateLimiter(redis, "tmdb", rps=45, burst=5),    # 50/s limit, leave headroom
    "steam":   RateLimiter(redis, "steam", rps=0.6, burst=2),  # 200/5min
    "igdb":    RateLimiter(redis, "igdb", rps=3.5, burst=1),   # 4/s free tier
    "omdb":    RateLimiter(redis, "omdb", rps=0.01, burst=1),  # 1000/day
    "fanart":  RateLimiter(redis, "fanart", rps=10, burst=5),
    "plex":    RateLimiter(redis, "plex", rps=5, burst=2),
}
```

---

## Circuit Breaker

Prevents cascading failures when a provider is down or rate-limiting:

```python
class CircuitBreaker:
    STATE_CLOSED = "closed"       # Normal operation
    STATE_OPEN = "open"           # Failing, reject immediately
    STATE_HALF_OPEN = "half_open" # Testing if provider recovered

    def __init__(self, name: str, failure_threshold: int = 5,
                 cooldown_seconds: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.key = f"circuit_breaker:{name}"

    async def call(self, fn: Callable, *args, **kwargs):
        state = await self._get_state()

        if state == self.STATE_OPEN:
            raise CircuitBreakerOpenError(f"Circuit {self.name} is open")

        try:
            result = await fn(*args, **kwargs)
            if state == self.STATE_HALF_OPEN:
                await self._transition_to(self.STATE_CLOSED)
            await self._reset_failures()
            return result
        except Exception:
            await self._record_failure()
            failures = await self._failure_count()
            if failures >= self.failure_threshold:
                await self._transition_to(self.STATE_OPEN)
            raise
```

---

## Sync Job Lifecycle

```
                    ┌──────────┐
                    │  pending  │
                    └────┬─────┘
                         │ enqueued
                    ┌────▼─────┐
                    │  queued   │
                    └────┬─────┘
                         │ worker picks up
                    ┌────▼─────┐
              ┌─────│  running  │─────┐
              │     └─────┬─────┘     │
              │ success   │ failure   │ retries exhausted
         ┌────▼────┐ ┌───▼────┐ ┌───▼──────┐
         │completed│ │ failed │ │ cancelled │
         └─────────┘ └───┬────┘ └──────────┘
                         │ retry (max 3)
                         ▼
                    ┌────▼─────┐
                    │  pending  │ (retries < 3)
                    └──────────┘
```

- Max 3 retries with exponential backoff (30s, 2min, 8min)
- Failed jobs log error_message + stack trace
- Parent job tracks child job completion — a movie sync isn't "complete" until all fanout children finish
