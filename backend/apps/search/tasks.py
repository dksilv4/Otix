"""Celery tasks for catalog search backfill."""

from __future__ import annotations

from celery import shared_task


@shared_task(name="search.prehydrate_games")
def prehydrate_games_task(titles: list[str]) -> dict:
    """Search IGDB for scanned titles and enqueue missing catalog ingest."""
    from apps.search.services.search import prehydrate_game_titles

    return prehydrate_game_titles(titles)
