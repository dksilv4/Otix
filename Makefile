.PHONY: up down build logs shell test lint migrate sync

up:
	docker compose up -d
	@echo "API:        http://localhost:8000/api/health"
	@echo "Metrics:    http://localhost:8000/api/metrics"

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f api

logs-worker:
	docker compose logs -f worker-fast

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

# ── Celery introspection ─────────────────────────────────────────

celery-status:
	docker compose exec worker-fast celery -A otix.infrastructure.celery.app inspect active

celery-queues:
	docker compose exec worker-fast celery -A otix.infrastructure.celery.app inspect active_queues

celery-stats:
	docker compose exec worker-fast celery -A otix.infrastructure.celery.app inspect stats
