# Task 6 Report: Add API versioning and clean main router

## Changes made

1. **`backend/otix/api/router.py`** — Removed line 1 (`# TODO: Review this file`). The router file is clean and in active use.

2. **`backend/entrypoints/api/main.py:116`** — Changed `app.include_router(api_router, prefix="/api")` to `app.include_router(api_router, prefix="/api/v1")`.

## Verification

All API routes now live under `/api/v1/`. Root-level health endpoints (`/health`, `/healthz`) remain unaffected — they are registered directly on the `FastAPI` app object, not under the `api_router`.

```
Health routes:
  /api/v1/health  — api_router's health (now versioned)
  /health         — root-level (unchanged)
  /healthz        — root-level (unchanged)
```
