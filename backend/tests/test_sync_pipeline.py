"""Integration tests for the TMDB sync pipeline.

Requires Docker services (db, redis). Gated behind @pytest.mark.integration.
Run: pytest tests/test_sync_pipeline.py -v -m integration
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
async def tmdb_provider(integration_redis):
    from otix.infrastructure.config import settings

    if not settings.tmdb_rat:
        pytest.skip("TMDB_API_KEY not configured")

    from otix.providers.tmdb.client import TMDBProvider

    return TMDBProvider(integration_redis)


# ── Full movie sync ─────────────────────────────────────────────────


class TestFullMovieSync:
    async def test_sync_movie_inserts(self, tmdb_provider, integration_session):
        from sqlalchemy import delete, select

        from otix.domain.media import ExternalID, MediaItem
        from otix.providers.tmdb.hydrator import TMDBHydrator
        from otix.providers.tmdb.transformer import to_movie

        # Clean up any pre-existing data from prior interrupted test runs
        await integration_session.execute(
            delete(ExternalID).where(
                ExternalID.provider == "tmdb", ExternalID.external_id == "550"
            )
        )

        hydrator = TMDBHydrator(tmdb_provider, integration_session)

        raw = await tmdb_provider.get_movie(550)
        assert raw["id"] == 550

        movie = to_movie(raw)
        media_item = movie.media_item

        # Should not exist in the DB yet
        existing = await integration_session.scalar(
            select(MediaItem)
            .join(ExternalID)
            .where(ExternalID.provider == "tmdb", ExternalID.external_id == "550")
        )
        assert existing is None

        # Insert
        integration_session.add(media_item)
        await integration_session.flush()
        integration_session.add(ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id))
        integration_session.add(movie)

        await hydrator.hydrate_genres(media_item, raw)
        await hydrator.hydrate_credits(media_item, raw)
        await hydrator.hydrate_images(media_item, raw)
        await hydrator.hydrate_ratings(media_item, raw)
        await hydrator.hydrate_external_ids(media_item, raw)

        await integration_session.flush()

        # Verify
        assert media_item.id is not None
        assert media_item.title == "Fight Club"

        # Check external ID was stored
        ext_id = await integration_session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "tmdb", ExternalID.external_id == "550"
            )
        )
        assert ext_id is not None
        assert ext_id.media_item_id == media_item.id

    async def test_sync_movie_idempotent(self, tmdb_provider, integration_session):
        from sqlalchemy import func, select

        from otix.domain.media import ExternalID, MediaItem
        from otix.providers.tmdb.hydrator import TMDBHydrator
        from otix.providers.tmdb.transformer import to_movie

        hydrator = TMDBHydrator(tmdb_provider, integration_session)

        # First sync — insert
        raw = await tmdb_provider.get_movie(550)
        movie = to_movie(raw)

        integration_session.add(movie.media_item)
        await integration_session.flush()
        integration_session.add(ExternalID(provider="tmdb", external_id="550", media_item_id=movie.media_item.id))
        integration_session.add(movie)
        await hydrator.hydrate_genres(movie.media_item, raw)
        await hydrator.hydrate_credits(movie.media_item, raw)
        await integration_session.flush()

        first_id = movie.media_item.id

        # Verify one row with this TMDB ID
        count = await integration_session.scalar(
            select(func.count())
            .select_from(MediaItem)
            .join(ExternalID)
            .where(ExternalID.provider == "tmdb", ExternalID.external_id == "550")
        )
        assert count == 1

        # Look up by external ID — should find the same record
        existing = await integration_session.scalar(
            select(MediaItem)
            .join(ExternalID)
            .where(ExternalID.provider == "tmdb", ExternalID.external_id == "550")
        )
        assert existing is not None
        assert existing.id == first_id

        # Count is still 1 (no duplicate created by the lookup)
        count = await integration_session.scalar(
            select(func.count())
            .select_from(MediaItem)
            .join(ExternalID)
            .where(ExternalID.provider == "tmdb", ExternalID.external_id == "550")
        )
        assert count == 1

    async def test_sync_show_with_seasons(self, tmdb_provider, integration_session):
        from sqlalchemy import select

        from otix.domain.media import ExternalID, Season
        from otix.providers.tmdb.hydrator import TMDBHydrator
        from otix.providers.tmdb.transformer import to_show

        hydrator = TMDBHydrator(tmdb_provider, integration_session)

        raw = await tmdb_provider.get_show(1399)
        show = to_show(raw)
        media_item = show.media_item

        integration_session.add(media_item)
        await integration_session.flush()
        integration_session.add(ExternalID(provider="tmdb", external_id="1399", media_item_id=media_item.id))
        integration_session.add(show)

        await hydrator.hydrate_genres(media_item, raw)
        await hydrator.hydrate_credits(media_item, raw)
        await hydrator.hydrate_images(media_item, raw)
        await hydrator.hydrate_ratings(media_item, raw)
        await hydrator.hydrate_external_ids(media_item, raw)

        await integration_session.flush()

        # Verify show
        assert show.media_item.title == "Game of Thrones"
        assert show.number_of_seasons is not None

        # Verify seasons were inserted
        seasons = await integration_session.scalars(
            select(Season).where(Season.show_id == show.media_item_id)
        )
        season_list = seasons.all()
        assert len(season_list) > 0
