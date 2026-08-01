#!/bin/bash
# ── Run DB migrations, then start the ASGI server ──────────────────────
# Called as the container CMD.  Ensures the database schema is up-to-date
# before the first request can arrive, without relying on the lifespan
# handler (which may be suppressed or fail silently).
#
# The alembic.ini is expected next to this script (i.e. in the backend/
# directory which is WORKDIR /app in the Docker image).
set -euo pipefail 2>/dev/null || set -eu

# Migrations can be run as a separate deploy step instead of on boot by
# setting RUN_MIGRATIONS=false (the app's run_migrations setting). Kept on by
# default so local dev / docker-compose keeps working unchanged.
migrations_enabled() {
  case "${RUN_MIGRATIONS:-1}" in
    1|true|yes|on|t) return 0 ;;
    *) return 1 ;;
  esac
}

if migrations_enabled; then
  echo ">>> Running database migrations..."
  alembic upgrade head
  echo ">>> Migrations applied successfully."
else
  echo ">>> Skipping migrations (RUN_MIGRATIONS off) — run 'alembic upgrade head' as a deploy step."
fi

exec uvicorn entrypoints.api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
