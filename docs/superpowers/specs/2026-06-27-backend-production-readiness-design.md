# Backend Production Readiness — Design Spec

## Scope

Backend (`backend/`) structural cleanup, testing foundation, CI, and configuration hygiene. Frontend, desktop, and extensions are out of scope for this spec.

## 1. API Layer — Standardize Router Convention

### Rule
- `__init__.py` = imports/exports only. One-liner: `from .router import router`
- `router.py` = APIRouter definition + all route handlers for that path segment
- Every route directory gets a `router.py`, even if it only mounts sub-routers

### Convention

```
otix/api/<feature>/<subpath>/router.py   # logic
otix/api/<feature>/<subpath>/__init__.py # from .router import router
```

All existing route logic that lives in `__init__.py` moves to `router.py`. No route signatures change.

### Naming

- `api/_utils.py` → `api/deps.py` (shared FastAPI dependencies: `get_db`, `get_current_user`, etc.)

### Main router

- `api/router.py` — remove `# TODO`, standardize import style
- Mount at `/api/v1` in `entrypoints/api/main.py`
- Health check stays at `/api/health` (unversioned)

## 2. Stray Files Cleanup

| File | Action |
|------|--------|
| `backend/epic_matches.json` | Move to `backend/data/` |
| `backend/backfill.py` | Move to `backend/scripts/` |
| `backend/bf.py` | Move to `backend/scripts/` |
| `backend/run_seed_test.py` | Move to `backend/tests/` |
| `backend/test_search.py` | Move to `backend/tests/` |
| `backend/celerybeat-schedule` | Add to `.gitignore` |

## 3. Configuration — Single `.env`

- Merge root `.env` and `backend/.env` (keep `backend/`'s CORS values — more complete)
- Delete `backend/.env`
- `docker-compose.yml`: all `env_file: ./backend/.env` → `env_file: ./.env`
- `.env.example`: update comment from "Copy to backend/.env" → "Copy to .env"

## 4. Test Structure

```
backend/tests/
├── conftest.py              # shared fixtures (existing, moved)
├── unit/
│   ├── api/                 # route-level tests
│   ├── services/            # service tests
│   ├── lib/                 # utility tests
│   └── domain/              # model tests (add as needed)
└── integration/
    ├── conftest.py          # docker-dependent fixtures
    └── ...                  # tests requiring db/redis
```

- Move stray tests (`run_seed_test.py`, `test_search.py`) into appropriate dirs
- Existing flat test files move to `unit/` subdirs matching source layout
- `pyproject.toml` testpaths updated

## 5. CI Pipeline

New file: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: otix_test
          POSTGRES_USER: otix
          POSTGRES_PASSWORD: password
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install .[dev]
      - run: ruff format --check --config backend/pyproject.toml backend/
      - run: ruff check --config backend/pyproject.toml backend/
      - run: mypy backend/otix/ --config-file backend/pyproject.toml
      - run: pytest backend/tests/ -v --ignore=backend/tests/integration
        env:
          DATABASE_URL: postgresql+asyncpg://otix:password@localhost:5432/otix_test
          DATABASE_URL_SYNC: postgresql://otix:password@localhost:5432/otix_test
          REDIS_URL: redis://localhost:6379/1
          JWT_SECRET_KEY: ci-test-key
          APP_ENV: test
```

## 6. Docker Compose Hygiene

- Remove inline `pip install pywebpush` from api command (already in pyproject.toml)
- PgBouncer auth type: `scram-sha-256` → `md5` (internal Docker network, no security loss, simpler)

## 7. `.gitignore`

Add:
- `celerybeat-schedule`
- Verify `.env`, `*.pyc`, `__pycache__/` are covered

---

## Out of Scope

- `docker-compose.prod.yml` audit
- Frontend / desktop / extensions
- API endpoint changes (derived routes, new features)
- Coverage targets — not yet, add after test structure is in place
- Database migration review
