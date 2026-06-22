#!/bin/bash
# ── Run DB migrations, then start the ASGI server ──────────────────────
# Called as the container CMD.  Ensures the database schema is up-to-date
# before the first request can arrive, without relying on the lifespan
# handler (which may be suppressed or fail silently).
#
# The alembic.ini is expected next to this script (i.e. in the backend/
# directory which is WORKDIR /app in the Docker image).
set -euo pipefail 2>/dev/null || set -eu

echo ">>> Running database migrations..."
alembic upgrade head
echo ">>> Migrations applied successfully."

exec uvicorn entrypoints.api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
