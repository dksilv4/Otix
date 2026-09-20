# Otix — local dev Makefile (Django backend in ./backend, legacy FastAPI tree
# is retired at ./old-backend and has no targets here).
#
# Compose targets talk to the dev stack in docker-compose.yml (db on :5433,
# redis on :6380, api on :8000). Code checks (lint/test/parity) run on the host
# venv because the api image installs runtime deps only (no ruff): `make deps`
# creates backend/.venv from uv.lock if it does not exist yet.
#
# Variables:  make seed provider=igdb kind=game limit=10    make makemigrations app=media

.PHONY: help up down build logs logs-all logs-worker shell worker-shell \
	db-shell redis-shell deps migrate makemigrations seed create-admin lint drift parity \
	test check celery-status celery-queues celery-stats \
	package-frontend build-frontend build-backend build-images prod-up prod-down

.DEFAULT_GOAL := help

help: ## List targets
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-16s %s\n", $$1, $$2}'

# ── Full dev lifecycle (one terminal) ────────────────────────────────────
dev: ## Run all services (backend, arr, storage server, frontend) in one terminal
	powershell -ExecutionPolicy Bypass -File ./run.ps1

run: dev

# ── Dev compose lifecycle ────────────────────────────────────────────────
up: ## Start the dev stack (api/worker/beat/db/redis)
	docker compose up -d
	@echo "API health: http://localhost:8000/api/v1/health"

down: ## Stop the dev stack
	docker compose down

build: ## Rebuild the api/worker/beat images
	docker compose build

logs: ## Tail api logs
	docker compose logs -f api

logs-worker: ## Tail worker logs
	docker compose logs -f worker

logs-all: ## Tail logs for every service
	docker compose logs -f

shell: ## Open a shell in the api container
	docker compose exec api bash

worker-shell: ## Open a shell in the celery worker container
	docker compose exec worker bash

db-shell: ## psql into the dev database
	docker compose exec db psql -U otix -d otix_dev

redis-shell: ## redis-cli into the dev redis
	docker compose exec redis redis-cli

# ── Django maintenance (against the compose DB, via the api container) ───
migrate: ## Apply migrations to the dev database
	docker compose exec api python manage.py migrate

makemigrations: ## Autogenerate a migration: make makemigrations app=<label>
	docker compose exec api python manage.py makemigrations $(app)

seed: ## Bulk-seed the catalog: make seed provider=igdb kind=game limit=10
	docker compose exec api python manage.py catalog_seed \
		--provider $(provider) --kind $(kind) --source $(source) --limit $(limit)

create-admin: ## Create or update local admin account (admin / admin123)
	docker compose exec api python manage.py create_admin
# seed variables
provider = tmdb
kind = movie
source = popular
limit = 25

# ── Host code checks (mirror the CI Django job; run from backend/) ───────
deps: ## Install locked deps (runtime + dev/ruff) into backend/.venv
	cd backend && uv sync --frozen

lint: ## ruff check (backend)
	cd backend && .venv/bin/ruff check .

drift: ## No-migration-drift gate
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python manage.py makemigrations --check --dry-run

parity: ## Frozen route-contract parity gate (263/263, 0 gaps)
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python scripts/parity_report.py | tee /tmp/otix-parity.txt && grep -qE "method-gaps: 0; remaining: 0" /tmp/otix-parity.txt

test: ## Full Django suite (config.settings.test; in-memory sqlite, ~4 min)
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python manage.py test

check: ## Full battery: lint + drift + parity + test
	$(MAKE) lint drift parity test

# ── Celery introspection (single worker on the `celery` queue) ───────────
celery-status: ## Active tasks
	docker compose exec worker celery -A config inspect active

celery-queues: ## Queues each worker consumes
	docker compose exec worker celery -A config inspect active_queues

celery-stats: ## Worker stats
	docker compose exec worker celery -A config inspect stats

# ── Release & Packaging ──────────────────────────────────────────────────
package-frontend: ## Build frontend production static bundle and release tarball
	cd frontend && npm run package:dist

build-frontend: ## Build frontend production Docker image
	docker build -t otix-frontend:latest -f frontend/Dockerfile frontend/

build-backend: ## Build backend production Docker image
	docker build -t otix-backend:latest -f backend/Dockerfile backend/

build-images: build-backend build-frontend ## Build both production Docker images

prod-up: ## Start the production compose stack
	docker compose -f docker-compose.prod.yml up -d

prod-down: ## Stop the production compose stack
	docker compose -f docker-compose.prod.yml down
