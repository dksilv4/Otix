# Otix Architecture Plan

## Overview

Rebuild Otix's backend in FastAPI + Python with a clean domain model, simplified sync pipeline, and a code-first API that auto-generates a type-safe TypeScript client. Keep the existing React UI components and swap out the data layer underneath them.

**Target:** 5-6 months for a solo developer.

**Document map:**

| Document | Focus |
|---|---|
| [Overview](docs/01-overview.md) | Goals, constraints, scope |
| [Technology Stack](docs/02-technology-stack.md) | Every technology choice with rationale and rejected alternatives |
| [Project Structure](docs/03-project-structure.md) | Directory layout, domain boundaries, module dependency rules |
| [Database Schema](docs/04-database-schema.md) | Complete SQL schema, relationships, migration from Django |
| [API Design](docs/05-api-design.md) | Endpoint catalog, layered architecture, auth flow, client generation |
| [Sync Pipeline](docs/06-sync-pipeline.md) | Queue architecture, provider integrations, rate limiting, circuit breaker |
| [Frontend](docs/07-frontend.md) | Component architecture, data layer swap, auth, routing |
| [Migration Plan](docs/08-migration-plan.md) | Timeline, phase details, risk items, cutover strategy |
| [Verification](docs/09-verification.md) | Test levels, performance benchmarks, acceptance checklist |

---

## Summary of Key Decisions

### Backend

| Layer | Choice | Why |
|---|---|---|
| Framework | **FastAPI** (Python) | Async-native, Pydantic v2, dependency injection. Clean break from Django ORM. |
| ORM | **SQLAlchemy 2.0** (async) | Explicit FKs. No GenericForeignKey, no ContentTypes, no multi-table inheritance. |
| Task queue | **Celery** (simplified) | Keep proven infra. Reduce from 30 queues to 7 with prefix-based routing. |
| Auth | **JWT** | Access token in memory, refresh token in HTTP-only cookie. Mature ecosystem. |
| Search | **PostgreSQL tsvector** | Good enough now. Swap for Meilisearch when faceted search is needed. |
| Real-time | **SSE** | Simpler than WebSocket for unidirectional event streams. |

### Frontend

| Layer | Action |
|---|---|
| React 19 + Vite | Keep |
| TanStack Router | Keep |
| TanStack Query | Keep, rewrite hooks |
| API client | Replace axios with `@otix/api-client` (generated from OpenAPI) |
| UI components | Keep all atoms, molecules, templates |
| Styling | Keep Tailwind, drop SCSS |

### Why Not the Alternatives

- **Go** — Solo dev with Python expertise. Learning idiomatic Go while translating domain logic is unnecessary risk.
- **PASETO** — Solves non-problems. Tiny library ecosystem.
- **asynq** — Celery isn't broken. Queue system migration adds risk with no benefit.
- **Full UI rebuild** — React components are well-built. Rebuilding them is busywork.

---

## Project Structure

```
otix/
├── backend/
│   ├── cmd/api/main.py, worker/main.py, beat/main.py
│   ├── otix/domain/, api/, services/, providers/, tasks/, infrastructure/, lib/
│   ├── alembic/
│   └── tests/
├── frontend/               # React 19 + Vite + TanStack
│   └── src/features/, components/, routes/, lib/
├── packages/@otix/api-client/, @otix/config/
├── docker-compose.yml
└── pnpm-workspace.yaml
```

8 domains (down from 22 Django apps): media, people, user, sync, catalog, auth, search, analytics.

---

## Database

**Shared `media_items` table with type-specific FK tables.** No GenericForeignKey, no ContentType framework anywhere.

```
media_items → movies, shows (→ seasons → episodes), games
external_ids: provider + external_id → media_item_id (replaces GFK)
user_media_interactions: user_id + media_item_id + type (replaces ContentType)
```

---

## API Design

Code-first: FastAPI + Pydantic → OpenAPI → `openapi-typescript` → `@otix/api-client`.

```
FastAPI route → Depends(auth, db) → Service → SQLAlchemy query → Pydantic response
```

---

## Sync Pipeline

7 Celery queues with prefix-based routing. Three pipeline phases: Core → Fanout → Enrichment.

Provider integrations follow a BaseProvider → BaseTransformer → BaseHydrator pattern with Redis-backed token bucket rate limiting and circuit breakers.

---

## Auth Flow

```
Login → { access_token } + refresh_token cookie (HTTP-only, SameSite=Lax)
Request → Authorization: Bearer <access_token>
401 → POST /auth/refresh → new access_token → retry
     → if refresh fails → /auth/login
```

---

## Migration Timeline

| Phase | Duration | What |
|---|---|---|
| 0: Foundation | 2-3 weeks | Project skeleton, CI/CD, auth |
| 1: Core API | 4-6 weeks | Media CRUD, search, TMDB movie sync |
| 2: Provider Sync | 6-8 weeks | All 7 providers, catalog, discovery |
| 3: Data Migration | 1-2 weeks | Migration tool, verification |
| 4: Frontend Data Layer | 3-4 weeks | New API client, query hooks, auth flow |
| 5: Cutover | 1 weekend | Read-only Django, DNS switch, monitoring |
| **Total** | **~5-6 months** | |

---

## Verification

8 acceptance areas: Auth, Sync, API Contract, Data Migration, Frontend, Performance, Rate Limiting, Regression. Full test plans and benchmarks in the [verification doc](docs/09-verification.md).
