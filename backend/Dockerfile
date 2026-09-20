# Otix backend (Django) — single image for dev (bind-mounted source) and
# future prod. Dependencies are installed into the global interpreter so a
# bind-mount of ./backend over /app still resolves imports at runtime.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    # uv has no `sync --system`; point the project env at the base prefix so
    # deps land in the global site-packages (a bind-mount of ./backend
    # over /app still resolves imports — the legacy pip image behaved the same).
    UV_PROJECT_ENVIRONMENT=/usr/local

# Install uv (lockfile-authoritative dependency manager for this project).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install only the locked runtime deps (no dev group, no project build). Source
# ships via bind mount in dev and via the COPY below for image-only (prod) runs.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project && uv cache clean

# Bake the Django app source for image-only runs (prod compose, standalone
# deploys). Dev still bind-mounts ./backend over /app, which hides these layers
# so the running source stays the host checkout. `entrypoints/start-api.sh` is
# the default command (migrate + uvicorn config.asgi); worker/beat services
# override it with their own `celery -A config` commands.
COPY . /app

# Collect static files for Django admin and DRF browsable API into staticfiles/
RUN DJANGO_SETTINGS_MODULE=config.settings.test python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["bash", "entrypoints/start-api.sh"]
