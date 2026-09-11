"""Tests for the IGDB popular-games discovery source + ``catalog_seed --provider igdb``
(increment 49).

The discovery feeder (``enqueue_igdb_popular``) is exercised with an injected
fake provider whose ``get_popular_games`` returns a list of game dicts — IGDB's
popular query is a single one-shot call (no pagination to roundtrip over a real
client), so asserting the provider seam is driven with the clamped limit and its
id list is parsed is the whole surface under test. The enqueue step crosses to a
worker thread via ``sync_to_async`` — a write that would escape ``TestCase``'s
rollback — so, like the tmdb popular/daily feeder tests, it stubs
``enqueue_seed_jobs`` and asserts the parsed ids feed through. The command tests
patch the service functions the same way the daily command tests do.
"""

from __future__ import annotations

import asyncio
import unittest.mock as mock
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.services import catalog_seed
from apps.integrations.services.catalog_seed import (
    _IGDB_QUERY_LIMIT,
    enqueue_igdb_discover,
    enqueue_igdb_popular,
)


def _run(coro):
    return asyncio.run(coro)


def _provider(results):
    provider = mock.Mock()
    provider.get_popular_games = mock.AsyncMock(return_value=results)
    return provider


class EnqueueIgdbPopularTests(TestCase):
    def test_collects_integer_ids_and_passes_unseen_ids_to_enqueue(self):
        provider = _provider(
            [{"id": 1, "name": "A"}, {"id": "x"}, {}, {"id": 2}, {"id": 1}, {"id": 3}]
        )
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]) as enqueue:
            summary = _run(enqueue_igdb_popular(limit=50, provider=provider))

        provider.get_popular_games.assert_awaited_once_with(limit=50)
        enqueue.assert_called_once_with(
            provider="igdb", entity_type="game", external_ids=["1", "2", "3"]
        )
        self.assertEqual(summary["discovered"], 3)
        self.assertEqual(summary["enqueued"], 0)

    def test_empty_results_enqueue_nothing(self):
        provider = _provider([])
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]) as enqueue:
            summary = _run(enqueue_igdb_popular(provider=provider))

        enqueue.assert_called_once_with(provider="igdb", entity_type="game", external_ids=[])
        self.assertEqual(summary["discovered"], 0)
        self.assertEqual(summary["enqueued"], 0)

    def test_clamps_limit_to_the_igdb_query_max(self):
        provider = _provider([])
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]):
            _run(enqueue_igdb_popular(limit=5000, provider=provider))
        provider.get_popular_games.assert_awaited_once_with(limit=_IGDB_QUERY_LIMIT)

    def test_reports_enqueued_created_ids(self):
        provider = _provider([{"id": 10}, {"id": 11}])
        with mock.patch.object(
            catalog_seed,
            "enqueue_seed_jobs",
            return_value=[SyncJob(provider="igdb", external_id="10")],
        ):
            summary = _run(enqueue_igdb_popular(limit=10, provider=provider))

        self.assertEqual(summary["discovered"], 2)
        self.assertEqual(summary["enqueued"], 1)
        self.assertEqual(summary["external_ids"], ["10"])

    def test_defaults_to_a_real_igdb_provider_when_none_passed(self):
        provider = _provider([{"id": 5}])
        with (
            mock.patch.object(catalog_seed, "IGDBProvider", return_value=provider) as factory,
            mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]),
        ):
            summary = _run(enqueue_igdb_popular(limit=5))

        factory.assert_called_once_with()
        provider.get_popular_games.assert_awaited_once_with(limit=5)
        self.assertEqual(summary["discovered"], 1)


def _fanout_provider():
    provider = mock.Mock()
    provider.get_popular_games = mock.AsyncMock(return_value=[{"id": 1}])
    provider.get_recently_released_games = mock.AsyncMock(return_value=[{"id": 2}])
    provider.get_upcoming_games = mock.AsyncMock(return_value=[{"id": 3}])
    provider.get_games_for_platform = mock.AsyncMock(
        side_effect=lambda platform_id, **_: [{"id": platform_id}]
    )
    return provider


class EnqueueIgdbDiscoverTests(TestCase):
    def test_fans_out_across_all_lists_by_default(self):
        provider = _fanout_provider()
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]) as enqueue:
            summary = _run(enqueue_igdb_discover(limit=50, provider=provider))

        provider.get_popular_games.assert_awaited_once_with(limit=50, fields="id")
        provider.get_recently_released_games.assert_awaited_once_with(limit=50, fields="id")
        provider.get_upcoming_games.assert_awaited_once_with(limit=50, fields="id")
        self.assertEqual(provider.get_games_for_platform.await_count, 4)
        enqueue.assert_called_once_with(
            provider="igdb",
            entity_type="game",
            external_ids=["1", "2", "3", "6", "167", "169", "130"],
        )
        self.assertEqual(summary["discovered"], 7)

    def test_clamps_each_list_to_the_igdb_query_max(self):
        provider = _fanout_provider()
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]):
            _run(enqueue_igdb_discover(limit=5000, provider=provider))
        provider.get_popular_games.assert_awaited_once_with(limit=_IGDB_QUERY_LIMIT, fields="id")

    def test_narrows_to_a_single_source(self):
        provider = _fanout_provider()
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]):
            summary = _run(
                enqueue_igdb_discover(limit=10, provider=provider, sources=("upcoming",))
            )
        provider.get_upcoming_games.assert_awaited_once_with(limit=10, fields="id")
        self.assertEqual(provider.get_popular_games.await_count, 0)
        self.assertEqual(provider.get_games_for_platform.await_count, 0)
        self.assertEqual(summary["discovered"], 1)

    def test_dedupes_ids_across_lists(self):
        provider = _fanout_provider()
        provider.get_popular_games = mock.AsyncMock(return_value=[{"id": 2}, {"id": 9}])
        provider.get_upcoming_games = mock.AsyncMock(return_value=[{"id": 2}])
        with mock.patch.object(catalog_seed, "enqueue_seed_jobs", return_value=[]) as enqueue:
            summary = _run(
                enqueue_igdb_discover(limit=10, provider=provider, sources=("popular", "upcoming"))
            )
        enqueue.assert_called_once_with(
            provider="igdb", entity_type="game", external_ids=["2", "9"]
        )
        self.assertEqual(summary["discovered"], 2)

    def test_rejects_unknown_source(self):
        provider = _fanout_provider()
        with self.assertRaises(ValueError):
            _run(enqueue_igdb_discover(provider=provider, sources=("bogus",)))


class CatalogSeedIgdbCommandTests(TestCase):
    def test_igdb_source_enqueues_and_drains(self):
        out = StringIO()
        summary = {
            "provider": "igdb",
            "entity_type": "game",
            "discovered": 3,
            "enqueued": 2,
            "external_ids": ["1", "2"],
        }
        drain = {"ran": 1, "succeeded": 1, "failed": 0, "skipped": 0}
        with (
            mock.patch.object(
                catalog_seed, "enqueue_igdb_discover", new=mock.AsyncMock(return_value=summary)
            ) as enqueue,
            mock.patch.object(catalog_seed, "run_pending_jobs", return_value=drain) as drain_jobs,
        ):
            call_command(
                "catalog_seed",
                provider="igdb",
                kind="game",
                limit=7,
                drain=True,
                stdout=out,
            )

        enqueue.assert_awaited_once_with(limit=7)
        drain_jobs.assert_called_once_with(provider="igdb", entity_type="game")
        self.assertIn("discovered 3 all game ids", out.getvalue())
        self.assertIn("enqueued 2 new sync jobs", out.getvalue())
        self.assertIn("drained 1 jobs: 1 succeeded", out.getvalue())

    def test_igdb_source_popular_routes_to_legacy_fetcher(self):
        out = StringIO()
        summary = {"provider": "igdb", "entity_type": "game", "discovered": 1, "enqueued": 1}
        with mock.patch.object(
            catalog_seed, "enqueue_igdb_popular", new=mock.AsyncMock(return_value=summary)
        ) as enqueue:
            call_command(
                "catalog_seed",
                provider="igdb",
                kind="game",
                source="popular",
                limit=5,
                stdout=out,
            )
        enqueue.assert_awaited_once_with(limit=5)

    def test_igdb_source_narrow_list_routes_to_discover(self):
        out = StringIO()
        summary = {"provider": "igdb", "entity_type": "game", "discovered": 2, "enqueued": 2}
        with mock.patch.object(
            catalog_seed, "enqueue_igdb_discover", new=mock.AsyncMock(return_value=summary)
        ) as enqueue:
            call_command(
                "catalog_seed",
                provider="igdb",
                kind="game",
                source="upcoming",
                limit=4,
                stdout=out,
            )
        enqueue.assert_awaited_once_with(limit=4, sources=("upcoming",))

    def test_igdb_source_rejects_unknown_list(self):
        with self.assertRaisesMessage(CommandError, "--source for igdb must be one of"):
            call_command(
                "catalog_seed",
                provider="igdb",
                kind="game",
                source="new",
                limit=5,
                stdout=StringIO(),
            )

    def test_igdb_source_rejects_non_game_kind(self):
        with self.assertRaisesMessage(CommandError, "IGDB discovery seeds --kind game only"):
            call_command("catalog_seed", provider="igdb", kind="show", limit=5, stdout=StringIO())

    def test_igdb_source_rejects_daily(self):
        with self.assertRaisesMessage(CommandError, "--source daily is TMDB-only"):
            call_command(
                "catalog_seed",
                provider="igdb",
                kind="game",
                source="daily",
                limit=0,
                stdout=StringIO(),
            )

    def test_tmdb_source_rejects_game_kind(self):
        with self.assertRaisesMessage(CommandError, "TMDB discovery seeds --kind movie|show only"):
            call_command("catalog_seed", kind="game", source="popular", limit=5, stdout=StringIO())
