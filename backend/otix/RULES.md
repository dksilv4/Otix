# Module Dependency Rules

These rules are enforced by convention and code review. Violating them creates circular imports or couples concerns that should stay independent.

## Dependency Direction

```
services/   → depends on → domain/
api/        → depends on → services/ + schemas/
tasks/      → depends on → services/ + providers/
providers/  → depends on → domain/ + lib/
infrastructure/ → no internal dependencies
lib/        → no internal dependencies
```

## Forbidden Imports

| Module | Must NEVER import from |
|--------|----------------------|
| `domain/` | services, api, tasks, providers |
| `services/` | api, tasks |
| `api/` | tasks |
| `providers/` | services, api, tasks (and other providers) |
| `infrastructure/` | domain, services, api, tasks, providers |
| `lib/` | domain, services, api, tasks, providers, infrastructure |

## Additional Rules

- **`api/`** — HTTP routes ONLY. No business logic. No database queries (delegate to services). Request validation via Pydantic schemas.
- **`domain/`** — SQLAlchemy ORM models ONLY. No business logic beyond property accessors. No async/await in model methods.
- **`services/`** — All business logic. One service class per domain concern. Services own transactions.
- **`providers/`** — External API integrations. Each provider is independent (no cross-provider imports). Follow BaseProvider pattern.
- **`tasks/`** — Celery task definitions ONLY. Thin wrappers that call services. No business logic in tasks.
- **`infrastructure/`** — Config, database sessions, Redis pool, logging. Pure wiring, no domain knowledge.
- **`lib/`** — Pure utility functions. No imports from any other otix module.
- **`schemas/`** — Pydantic models for request/response shapes. No business logic.
