# Otix backend (Django)

Django + Django REST Framework rewrite of the Otix platform backend. This
directory is a greenfield foundation that will eventually replace the live
FastAPI backend at `../backend` (which stays untouched until cutover).

Read **ARCHITECTURE.md** before writing any code — it is the conventions
contract every domain app must follow.

## Quickstart

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
uv sync                          # install deps + create .venv
cp .env.example .env             # then edit SECRET_KEY / DATABASE_URL
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
```

By default the platform uses Postgres. For a throwaway local run you can point
DATABASE_URL at sqlite:

```bash
DATABASE_URL=sqlite:///./dev.db .venv/bin/python manage.py migrate
```

## Tests

```bash
# In-memory sqlite, runs anywhere:
DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python manage.py test
```

## Layout

```
manage.py
config/            # Django project: settings/, urls.py, asgi/wsgi, celery.py
apps/accounts/     # golden reference app (custom User + auth slice)
core/              # shared, app-agnostic code (NOT an installed app)
plugins/           # reserved: plugin framework (future work)
```

See ARCHITECTURE.md for the full canonical layout and rationale.
