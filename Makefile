.PHONY: up down build logs shell test lint migrate sync

N ?= 50

up:
	docker compose up -d
	@echo "API:        http://localhost:8000/api/health"
	@echo "Metrics:    http://localhost:8000/api/metric"

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f api

logs-worker:
	docker compose logs -f worker-fast worker-provider worker-user worker-control

logs-worker-fast:
	docker compose logs -f worker-fast

logs-worker-provider:
	docker compose logs -f worker-provider

logs-worker-user:
	docker compose logs -f worker-user

logs-worker-control:
	docker compose logs -f worker-control

logs-all:
	docker compose logs -f

shell:
	docker compose exec api bash

worker-shell:
	docker compose exec worker-fast bash

db-shell:
	docker compose exec db psql -U otix -d otix_dev

redis-shell:
	docker compose exec redis redis-cli

test:
	docker compose exec api pytest tests/ -v

lint:
	docker compose exec api ruff check otix/

migrate:
	docker compose exec api alembic upgrade head

migration:
	docker compose exec api alembic revision --autogenerate -m "$(name)"

rollback:
	docker compose exec api alembic downgrade -1

# ── Sync (trigger from API container) ────────────────────────────

sync-popular-movies:
	docker compose exec api python -c "from otix.tasks.sync import sync_tmdb_popular_movies_task; print(sync_tmdb_popular_movies_task.delay(3).id)"

sync-popular-shows:
	docker compose exec api python -c "from otix.tasks.sync import sync_tmdb_popular_shows_task; print(sync_tmdb_popular_shows_task.delay(3).id)"

sync-movie:
	docker compose exec api python -c "from otix.tasks.sync import sync_tmdb_movie_task; import sys; print(sync_tmdb_movie_task.delay(int(sys.argv[1])).id)" $(id)

sync-show:
	docker compose exec api python -c "from otix.tasks.sync import sync_tmdb_show_task; import sys; print(sync_tmdb_show_task.delay(int(sys.argv[1])).id)" $(id)

# ── Manual hydration (enrich artwork for discover page) ───────────

# Enqueue Fanart enrichment for the top N movies missing artwork.
# Usage: make hydrate-movies [N=50]
hydrate-movies:
	docker compose exec api python -m otix.tasks.manual_hydrate movies $(N)

# Enqueue Fanart enrichment for the top N shows missing artwork.
# Usage: make hydrate-shows [N=50]
hydrate-shows:
	docker compose exec api python -m otix.tasks.manual_hydrate shows $(N)

# Enqueue Fanart enrichment for a single movie by Otix media_item_id.
# Usage: make hydrate-movie oid=oti_abc123
hydrate-movie:
	docker compose exec api python -m otix.tasks.manual_hydrate movie $(oid)

# ── Celery introspection ─────────────────────────────────────────

celery-status:
	docker compose exec worker-fast celery -A otix.infrastructure.celery.app inspect active

celery-queues:
	docker compose exec worker-fast celery -A otix.infrastructure.celery.app inspect active_queues

celery-stats:
	docker compose exec worker-fast celery -A otix.infrastructure.celery.app inspect stats
