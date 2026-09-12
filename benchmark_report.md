# 🏎️ API Benchmark Report

**Date:** 2026-07-06 23:46:24
**Base URL:** http://localhost:8000
**Endpoints Tested:** 79
**Skipped (no auth):** 0

## 📈 Summary Statistics

| Metric | Value |
|--------|-------|
| Average | `188 ms` |
| Median | `6 ms` |
| P95 | `321 ms` |
| P99 | `6938 ms` |
| Slow (>500ms) | **3** endpoints |
| Critical (>1000ms) | **2** endpoints |
| Errors (5xx) | **0** endpoints |

## 🔴 Critical Performance Issues (>1000ms)

| Method | Path | Time |
|--------|------|------|
| GET | `/api/v1/search` | 6938ms |
| GET | `/api/v1/search/grouped` | 4989ms |

## ⚠️ Slow Endpoints (>500ms)

| Method | Path | Time |
|--------|------|------|
| GET | `/api/v1/search/poll` | 841ms |

## 📊 Results by Category

### Discover

*Avg: 54ms | Median: 53ms | Max: 237ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/discover/hero` | 200 |      237ms |
| GET | `/api/v1/discover/music/popular` | 200 |       64ms |
| GET | `/api/v1/discover/music/trending` | 200 |       61ms |
| GET | `/api/v1/discover/movie/popular` | 200 |       60ms |
| GET | `/api/v1/discover/show/popular` | 200 |       54ms |
| GET | `/api/v1/discover/game/popular` | 200 |       54ms |
| GET | `/api/v1/discover/game/trending` | 200 |       53ms |
| GET | `/api/v1/discover/movie/trending` | 200 |       52ms |
| GET | `/api/v1/discover/show/trending` | 200 |       52ms |
| GET | `/api/v1/discover/trailers/trending` | 200 |        7ms |
| GET | `/api/v1/discover/sections` | 200 |        6ms |
| GET | `/api/v1/discover/show/top-rated` | 400 |        4ms |
| GET | `/api/v1/discover/movie/top-rated` | 400 |        3ms |

### Search

*Avg: 1878ms | Median: 321ms | Max: 6938ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/search/suggestions` | ERR |    30005ms 🔴 |
| GET | `/api/v1/search` | 200 |     6938ms 🔴 |
| GET | `/api/v1/search/grouped` | 200 |     4989ms 🔴 |
| GET | `/api/v1/search/poll` | 200 |      841ms ⚠️ |
| GET | `/api/v1/search/external` | 200 |      321ms |
| GET | `/api/v1/search/companies` | 200 |       42ms |
| GET | `/api/v1/users/search` | 200 |        9ms |
| GET | `/api/v1/people/search` | 404 |        3ms |

### Media

*Avg: 122ms | Median: 100ms | Max: 277ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/media/certifications` | 200 |      277ms |
| GET | `/api/v1/media/` | 200 |      186ms |
| GET | `/api/v1/media/genres` | 200 |       14ms |
| GET | `/api/v1/media/company` | 200 |       10ms |

### People

*Avg: 5ms | Median: 5ms | Max: 5ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/people` | 404 |        5ms |

### Company

*Avg: 8ms | Median: 8ms | Max: 8ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/company/1` | 404 |        8ms |

### Library

*Avg: 4ms | Median: 3ms | Max: 10ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/library/installed` | 200 |       10ms |
| GET | `/api/v1/library/music` | 401 |        5ms |
| GET | `/api/v1/library/movies` | 401 |        4ms |
| GET | `/api/v1/library/games` | 401 |        3ms |
| GET | `/api/v1/library/shows` | 401 |        3ms |
| GET | `/api/v1/users//library-stats` | 404 |        2ms |

### User

*Avg: 6ms | Median: 3ms | Max: 35ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/users/me/daily-activity` | 200 |       35ms |
| GET | `/api/v1/users/me/continue` | 200 |       18ms |
| GET | `/api/v1/users/me/activity-heatmap` | 200 |       13ms |
| GET | `/api/v1/users/me` | 404 |       12ms |
| GET | `/api/v1/users/me/friends/activity` | 200 |       11ms |
| GET | `/api/v1/users/followers` | 404 |        9ms |
| GET | `/api/v1/users/following` | 404 |        6ms |
| GET | `/api/v1/users/metric` | 404 |        6ms |
| PATCH | `/api/v1/users/me` | 405 |        5ms |
| GET | `/api/v1/users//mood-timeline` | 404 |        5ms |
| GET | `/api/v1/users/me/preferences` | 404 |        4ms |
| GET | `/api/v1/users/` | 404 |        3ms |
| GET | `/api/v1/users/achievements` | 200 |        3ms |
| GET | `/api/v1/users//reviews` | 404 |        3ms |
| GET | `/api/v1/users//activity` | 404 |        3ms |
| GET | `/api/v1/users/follow/counts` | 404 |        3ms |
| GET | `/api/v1/users/follow/requests` | 404 |        3ms |
| GET | `/api/v1/users/me/integrations` | 404 |        3ms |
| GET | `/api/v1/users/follow/status` | 404 |        3ms |
| DELETE | `/api/v1/users/follow` | 405 |        3ms |
| GET | `/api/v1/users//top-rated` | 404 |        3ms |
| POST | `/api/v1/users/follow` | 405 |        2ms |
| GET | `/api/v1/users//hall-of-fame` | 404 |        2ms |
| GET | `/api/v1/users//stats` | 404 |        2ms |
| GET | `/api/v1/users//karma` | 404 |        2ms |
| GET | `/api/v1/users//badges` | 404 |        2ms |
| GET | `/api/v1/users//rating` | 404 |        2ms |
| GET | `/api/v1/users//karma/transactions` | 404 |        2ms |
| GET | `/api/v1/users//reputation` | 404 |        2ms |
| GET | `/api/v1/users//rating-distribution` | 404 |        2ms |

### Auth

*Avg: 5ms | Median: 5ms | Max: 9ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/auth/sessions` | 200 |        9ms |
| POST | `/api/v1/auth/login` | 422 |        2ms |

### Friends

*Avg: 11ms | Median: 10ms | Max: 15ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/friends/requests/incoming` | 200 |       15ms |
| GET | `/api/v1/friends/requests/outgoing` | 200 |       13ms |
| GET | `/api/v1/friends` | 200 |        7ms |
| GET | `/api/v1/friends/status/nonexistent` | 200 |        7ms |

### Notifications

*Avg: 8ms | Median: 8ms | Max: 9ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/notifications` | 200 |        9ms |
| GET | `/api/v1/notifications/unread-count` | 200 |        8ms |

### Push

*Avg: 5ms | Median: 5ms | Max: 6ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| POST | `/api/v1/push/subscribe` | 422 |        6ms |
| GET | `/api/v1/push/vapid-public-key` | 200 |        3ms |

### Tracks

*Avg: 12ms | Median: 12ms | Max: 12ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/tracks/1/rating` | 404 |       12ms |

### Upload

*Avg: 8ms | Median: 8ms | Max: 8ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| POST | `/api/v1/upload` | 422 |        8ms |

### Mood

*Avg: 7ms | Median: 7ms | Max: 7ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/api/v1/mood-checkins/today` | 200 |        7ms |

### Health & Readiness

*Avg: 7ms | Median: 5ms | Max: 10ms*

| Method | Path | Status | Time |
|--------|------|--------|------|
| GET | `/healthz` | 200 |       10ms |
| GET | `/api/v1/health` | 200 |        5ms |
| GET | `/health` | 200 |        4ms |

## 🛠️ Optimization Opportunities

### 1. Search Endpoints

Search queries are slow because they call embedding APIs (pgvector similarity) and join across tables.
Consider:
- **Warming the embedding model cache** (already done at startup — verify it's working)
- **Adding Redis caching with longer TTL** for popular queries
- **Using materialized search views** in Postgres for frequent query patterns
- **Async pre-computation of embeddings** via Celery when new media is added

### 4. General Optimization

| Issue | Suggestion |
|-------|-----------|
| N+1 queries | Audit service layer for lazy-loaded relationships (use selectinload eagerly) |
| Missing indexes | Check EXPLAIN ANALYZE on slow queries — look for sequential scans on large tables |
| Serial embedding calls | Ensure `_call_embed_query` is non-blocking and connection-pooled |
| Unbatched DB calls | Batch external ID lookups (many endpoints do this per-item) |
| Hot Redis keys | Check `media:detail:*` TTL — 30s may be too short for popular items |
| Celery task overhead | Import-in-path endpoints fire Celery per-game — batch where possible |
| No CDN for uploads | Static files served from Python — offload to nginx/CloudFront |

### 5. Auth Hot Path

| Endpoint | Concern |
|----------|---------|
| POST /auth/login | bcrypt comparison + JWT signing — ensure index on username |
| POST /auth/refresh | Token rotation adds DB writes — batch cleanup of old tokens |
| All auth-required | JWT decode per request — minimal overhead but time spent in middleware |
