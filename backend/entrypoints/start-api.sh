#!/bin/bash
# ── Run Django migrations, then start the ASGI server ──────────────────────
# Called as the container CMD for the `api` service. Ensures the database
# schema is up to date before the first request can arrive. Runs `uvicorn
# config.asgi:application` because the realtime surface (`core.sse`) serves
# async-generator `text/event-stream` responses over ASGI (see ARCHITECTURE.md).
set -euo pipefail 2>/dev/null || set -eu

# Migrations can be run as a separate deploy step instead of on boot by
# setting RUN_MIGRATIONS=false. Kept on by default so local dev / docker-compose
# keeps working unchanged.
migrations_enabled() {
  case "${RUN_MIGRATIONS:-1}" in
    1|true|yes|on|t) return 0 ;;
    *) return 1 ;;
  esac
}

if migrations_enabled; then
  echo ">>> Running database migrations..."
  python manage.py migrate --noinput
  echo ">>> Migrations applied successfully."

else
  echo ">>> Skipping migrations (RUN_MIGRATIONS off) — run 'manage.py migrate' as a deploy step."
fi

# --reload lets bind-mounted source changes take effect without a container
# restart. Off by default (prod); the dev compose sets ENABLE_RELOAD.
# Graceful shutdown must be bounded: SSE and Vite keep-alive connections
# otherwise leave uvicorn stuck on "Waiting for connections to close", and
# every subsequent request (including public media detail) hangs.
if [ "${ENABLE_RELOAD:-0}" = "1" ] || [ "${ENABLE_RELOAD:-0}" = "true" ]; then
  reload_flag="--reload --timeout-graceful-shutdown 2"
else
  reload_flag=""
fi

# WEB_CONCURRENCY fans the ASGI app out across N uvicorn worker processes
# (prod). Mutually exclusive with --reload, so it only applies when reload is
# off; a non-numeric value falls through to a single worker.
workers_flag=""
if [ -z "${reload_flag}" ] && [ "${WEB_CONCURRENCY:-1}" -gt 1 ] 2>/dev/null; then
  workers_flag="--workers ${WEB_CONCURRENCY}"
fi

exec uvicorn config.asgi:application --host 0.0.0.0 --port "${PORT:-8000}" ${reload_flag} ${workers_flag}
