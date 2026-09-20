"""Tests for the TMDB daily-export discovery source + catalog beat tasks
(increment 48).

``iter_export_ids``/``download_tmdb_export`` are exercised directly (pure
download/parse over a MockTransport + real gzip bytes — no network, no DB).
``enqueue_tmdb_daily``'s ORM write runs via ``sync_to_async`` on a worker-thread
connection that would escape ``TestCase`` rollback, so — like the popular feeder
test — it stubs ``enqueue_seed_jobs`` and asserts the parsed ids are fed through
in bounded batches rather than touching the DB. The beat tasks are thin wrappers
resolved through the ``catalog_seed`` module attribute at call time, so they are
patched and asserted the same way the engine roundtrips stub their fetchers.
"""

from __future__ import annotations

import asyncio
import gzip
import os
import tempfile
from io import StringIO
from pathlib import Path
from unittest import mock

import httpx
from celery.schedules import crontab
from django.conf import settings
from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.integrations.services import catalog_seed
from apps.integrations.tasks import (
    catalog_daily_tmdb,
    catalog_drain,
    catalog_seed_popular,
    catalog_sync_updated,
)

_EXPORT_TEXT = (
    "[\n"
    '{"id": 11, "original_title": "One"},\n'
    '{"id": 12, "original_title": "Two"},\n'
    "not-json,\n"
    '{"id": "x", "original_title": "Bad"},\n'
    '{"id": 13, "original_title": "Three"}\n'
    "]"
)


def _run(coro):
    return asyncio.run(coro)


def _export_gzip_bytes():
    return gzip.compress(_EXPORT_TEXT.encode("utf-8"))


def _write_export_file() -> Path:
    fd, name = tempfile.mkstemp(suffix=".json.gz")
    os.close(fd)
    path = Path(name)
    path.write_bytes(_export_gzip_bytes())
    return path


class IterExportIdsTests(TestCase):
    def test_yields_integer_ids_skipping_markers_bad_rows_and_commas(self):
        path = _write_export_file()
        try:
            self.assertEqual(list(catalog_seed.iter_export_ids(path)), ["11", "12", "13"])
        finally:
            path.unlink(missing_ok=True)

    def test_limit_stops_the_walk(self):
        path = _write_export_file()
        try:
            self.assertEqual(list(catalog_seed.iter_export_ids(path, limit=2)), ["11", "12"])
        finally:
            path.unlink(missing_ok=True)


class DownloadTmdBExportTests(TestCase):
    def _client_for(self, handler):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    def test_downloads_todays_export(self):
        requested: list[str] = []

        def handler(request):
            requested.append(request.url.path)
            return httpx.Response(200, content=_export_gzip_bytes())

        dates = ("01_02_2026", "01_01_2026")
        with mock.patch.object(catalog_seed, "_export_dates", return_value=dates):
            client = self._client_for(handler)
            try:
                path = _run(
                    catalog_seed.download_tmdb_export("movie_ids", client=client, api_key="k")
                )
            finally:
                _run(client.aclose())
        self.assertIsNotNone(path)
        self.assertEqual(requested, [f"/p/exports/movie_ids_{dates[0]}.json.gz"])
        with gzip.open(path, "rt", encoding="utf-8") as f:
            self.assertIn('"id": 11', f.read())
        path.unlink(missing_ok=True)

    def test_falls_back_to_yesterday_when_today_is_404(self):
        requested: list[str] = []
        dates = ("01_02_2026", "01_01_2026")

        def handler(request):
            requested.append(request.url.path)
            status = 404 if request.url.path.endswith(f"{dates[0]}.json.gz") else 200
            content = _export_gzip_bytes() if status == 200 else b""
            return httpx.Response(status, content=content)

        with mock.patch.object(catalog_seed, "_export_dates", return_value=dates):
            client = self._client_for(handler)
            try:
                path = _run(catalog_seed.download_tmdb_export("movie_ids", client=client))
            finally:
                _run(client.aclose())
        self.assertIsNotNone(path)
        self.assertEqual(
            requested,
            [
                f"/p/exports/movie_ids_{dates[0]}.json.gz",
                f"/p/exports/movie_ids_{dates[1]}.json.gz",
            ],
        )
        path.unlink(missing_ok=True)

    def test_no_published_export_returns_none(self):
        dates = ("01_02_2026", "01_01_2026")
        with mock.patch.object(catalog_seed, "_export_dates", return_value=dates):
            client = self._client_for(lambda request: httpx.Response(404))
            try:
                path = _run(catalog_seed.download_tmdb_export("movie_ids", client=client))
            finally:
                _run(client.aclose())
        self.assertIsNone(path)

    def test_server_error_propagates(self):
        with mock.patch.object(
            catalog_seed, "_export_dates", return_value=("01_02_2026", "01_01_2026")
        ):
            client = self._client_for(lambda request: httpx.Response(500))
            try:
                with self.assertRaises(httpx.HTTPStatusError):
                    _run(catalog_seed.download_tmdb_export("movie_ids", client=client))
            finally:
                _run(client.aclose())


class EnqueueTmdBDailyTests(TestCase):
    def test_streams_ids_into_enqueue_in_bounded_batches(self):
        path = _write_export_file()
        with (
            mock.patch.object(
                catalog_seed, "download_tmdb_export", new=mock.AsyncMock(return_value=path)
            ),
            mock.patch.object(catalog_seed, "_ENQUEUE_BATCH_SIZE", 2),
            mock.patch.object(catalog_seed, "enqueue_seed_jobs") as enqueue,
        ):
            enqueue.side_effect = lambda *, external_ids, **kw: [
                mock.Mock(external_id=i) for i in external_ids
            ]
            summary = _run(catalog_seed.enqueue_tmdb_daily("movie", limit=5))

        self.assertEqual(enqueue.call_count, 2)
        first = enqueue.call_args_list[0].kwargs
        second = enqueue.call_args_list[1].kwargs
        self.assertEqual(first["provider"], "tmdb")
        self.assertEqual(first["entity_type"], "movie")
        self.assertEqual(first["external_ids"], ["11", "12"])
        self.assertEqual(second["external_ids"], ["13"])
        self.assertEqual(summary["discovered"], 3)
        self.assertEqual(summary["enqueued"], 3)
        self.assertEqual(summary["external_ids"], ["11", "12", "13"])
        self.assertFalse(path.exists())

    def test_unavailable_export_is_reported_not_raised(self):
        with (
            mock.patch.object(
                catalog_seed, "download_tmdb_export", new=mock.AsyncMock(return_value=None)
            ),
            mock.patch.object(catalog_seed, "enqueue_seed_jobs") as enqueue,
        ):
            summary = _run(catalog_seed.enqueue_tmdb_daily("movie", limit=5))

        self.assertEqual(summary["export"], "unavailable")
        self.assertEqual(summary["discovered"], 0)
        self.assertEqual(summary["enqueued"], 0)
        enqueue.assert_not_called()

    def test_unsupported_entity_type_raises(self):
        with mock.patch.object(catalog_seed, "download_tmdb_export", new=mock.AsyncMock()):
            with self.assertRaises(ValueError):
                _run(catalog_seed.enqueue_tmdb_daily("game"))


class RunDailyTmdBImportTests(TestCase):
    def test_imports_movie_then_show(self):
        summaries = {
            "movie": {"entity_type": "movie", "discovered": 2, "enqueued": 1},
            "show": {"entity_type": "show", "discovered": 1, "enqueued": 0},
        }
        deletions = {"movie": {"deleted": 0}, "show": {"deleted": 0}}
        with (
            mock.patch.object(
                catalog_seed,
                "enqueue_tmdb_daily",
                new=mock.AsyncMock(side_effect=lambda entity_type, **kw: summaries[entity_type]),
            ) as enqueue,
            mock.patch.object(
                catalog_seed, "run_tmdb_deletion_scan", return_value=deletions
            ) as deletion_scan,
        ):
            result = catalog_seed.run_daily_tmdb_import(limit=10)

        self.assertEqual([c.args[0] for c in enqueue.await_args_list], ["movie", "show"])
        for c in enqueue.await_args_list:
            self.assertEqual(c.kwargs["limit"], 10)
        deletion_scan.assert_called_once_with()
        self.assertEqual(
            result,
            {"movie": summaries["movie"], "show": summaries["show"], "deletions": deletions},
        )


class CatalogBeatTaskTests(TestCase):
    def test_daily_noop_without_api_key(self):
        with mock.patch.object(catalog_seed, "run_daily_tmdb_import") as importer:
            with override_settings(TMDB_API_KEY=""):
                result = catalog_daily_tmdb()
        importer.assert_not_called()
        self.assertEqual(result, {"status": "unconfigured"})

    def test_daily_runs_the_import_with_the_configured_limit(self):
        summary = {"movie": {"enqueued": 1}, "show": {"enqueued": 0}}
        with mock.patch.object(
            catalog_seed, "run_daily_tmdb_import", return_value=summary
        ) as importer:
            with override_settings(TMDB_API_KEY="k", CATALOG_DAILY_TMDB_LIMIT=123):
                result = catalog_daily_tmdb()
        importer.assert_called_once_with(limit=123)
        self.assertEqual(result, summary)

    def test_drain_runs_pending_jobs_bounded(self):
        drain = {"ran": 4, "succeeded": 4, "failed": 0, "skipped": 0}
        with mock.patch.object(
            catalog_seed, "drain_catalog", return_value={"drain": drain}
        ) as drainer:
            with override_settings(CATALOG_DRAIN_LIMIT=77):
                result = catalog_drain()
        drainer.assert_called_once_with(limit=77)
        self.assertEqual(result, {"drain": drain})

    def test_beat_schedule_targets_tasks(self):
        schedule = settings.CELERY_BEAT_SCHEDULE
        self.assertEqual(schedule["catalog-daily-tmdb-import"]["task"], catalog_daily_tmdb.name)
        self.assertEqual(schedule["catalog-popular-seed"]["task"], catalog_seed_popular.name)
        self.assertEqual(schedule["catalog-updated-sync"]["task"], catalog_sync_updated.name)
        self.assertEqual(schedule["catalog-backlog-drain"]["task"], catalog_drain.name)
        daily = schedule["catalog-daily-tmdb-import"]["schedule"]
        popular = schedule["catalog-popular-seed"]["schedule"]
        updated = schedule["catalog-updated-sync"]["schedule"]
        drain = schedule["catalog-backlog-drain"]["schedule"]
        self.assertIsInstance(daily, crontab)
        self.assertEqual(daily.hour, {3})
        self.assertEqual(daily.minute, {7})
        self.assertIsInstance(popular, crontab)
        self.assertEqual(popular.minute, {0})
        self.assertIsInstance(updated, crontab)
        self.assertEqual(updated.minute, {30})
        self.assertIsInstance(drain, crontab)
        self.assertEqual(sorted(drain.minute), list(range(0, 60, 5)))

    def test_popular_seed_runs_bounded(self):
        summary = {"tmdb": {"status": "unconfigured"}, "igdb": {"status": "unconfigured"}}
        with mock.patch.object(
            catalog_seed, "seed_popular_catalog", return_value=summary
        ) as seeder:
            with override_settings(CATALOG_POPULAR_SEED_LIMIT=42):
                result = catalog_seed_popular()
        seeder.assert_called_once_with(limit=42)
        self.assertEqual(result, summary)

    def test_updated_sync_runs_bounded(self):
        summary = {"tmdb": {"status": "unconfigured"}, "igdb": {"status": "unconfigured"}}
        with mock.patch.object(
            catalog_seed, "seed_updated_catalog", return_value=summary
        ) as syncer:
            with override_settings(CATALOG_UPDATED_SYNC_LIMIT=33):
                result = catalog_sync_updated()
        syncer.assert_called_once_with(limit=33)
        self.assertEqual(result, summary)


class SeedPopularCatalogTests(TestCase):
    def test_unconfigured_reporting(self):
        with override_settings(
            TMDB_API_KEY="", TMDB_RAT="", IGDB_CLIENT_ID="", IGDB_CLIENT_SECRET=""
        ):
            result = catalog_seed.seed_popular_catalog(limit=10)
        self.assertEqual(result["tmdb"], {"status": "unconfigured"})
        self.assertEqual(result["igdb"], {"status": "unconfigured"})

    def test_configured_runs_enqueues(self):
        tmdb_res = {"discovered": 2, "enqueued": 2}
        igdb_res = {"discovered": 3, "enqueued": 3}
        with (
            override_settings(
                TMDB_API_KEY="k",
                IGDB_CLIENT_ID="id",
                IGDB_CLIENT_SECRET="sec",
            ),
            mock.patch.object(
                catalog_seed, "enqueue_tmdb_popular", new=mock.AsyncMock(return_value=tmdb_res)
            ) as tmdb_enqueue,
            mock.patch.object(
                catalog_seed, "enqueue_igdb_popular", new=mock.AsyncMock(return_value=igdb_res)
            ) as igdb_enqueue,
        ):
            result = catalog_seed.seed_popular_catalog(limit=15)

        self.assertEqual(tmdb_enqueue.await_count, 2)
        igdb_enqueue.assert_awaited_once_with(limit=15)
        self.assertEqual(result["tmdb"]["movie"], tmdb_res)
        self.assertEqual(result["tmdb"]["show"], tmdb_res)
        self.assertEqual(result["igdb"]["game"], igdb_res)


class SeedUpdatedCatalogTests(TestCase):
    def test_unconfigured_reporting(self):
        with override_settings(
            TMDB_API_KEY="", TMDB_RAT="", IGDB_CLIENT_ID="", IGDB_CLIENT_SECRET=""
        ):
            result = catalog_seed.seed_updated_catalog(limit=10)
        self.assertEqual(result["tmdb"], {"status": "unconfigured"})
        self.assertEqual(result["igdb"], {"status": "unconfigured"})

    def test_configured_runs_enqueues(self):
        tmdb_res = {"discovered": 4, "enqueued": 4}
        igdb_res = {"discovered": 1, "enqueued": 1}
        with (
            override_settings(
                TMDB_API_KEY="k",
                IGDB_CLIENT_ID="id",
                IGDB_CLIENT_SECRET="sec",
            ),
            mock.patch.object(
                catalog_seed, "enqueue_tmdb_changes", new=mock.AsyncMock(return_value=tmdb_res)
            ) as tmdb_changes,
            mock.patch.object(
                catalog_seed, "enqueue_igdb_changes", new=mock.AsyncMock(return_value=igdb_res)
            ) as igdb_changes,
        ):
            result = catalog_seed.seed_updated_catalog(limit=20)

        self.assertEqual(tmdb_changes.await_count, 2)
        igdb_changes.assert_awaited_once_with(limit=20)
        self.assertEqual(result["tmdb"]["movie"], tmdb_res)
        self.assertEqual(result["tmdb"]["show"], tmdb_res)
        self.assertEqual(result["igdb"]["game"], igdb_res)


class EnqueueChangesTests(TestCase):
    def test_enqueue_tmdb_changes(self):
        provider = mock.Mock()
        provider.get_movie_changes = mock.AsyncMock(
            return_value={"results": [{"id": 101}, {"id": 102}], "total_pages": 1}
        )
        with mock.patch.object(
            catalog_seed, "ensure_catalog_job", return_value=mock.Mock()
        ) as ensure_job:
            summary = _run(catalog_seed.enqueue_tmdb_changes("movie", limit=10, provider=provider))

        provider.get_movie_changes.assert_awaited_once()
        self.assertEqual(summary["discovered"], 2)
        self.assertEqual(summary["enqueued"], 2)
        self.assertEqual(ensure_job.call_count, 2)

    def test_enqueue_igdb_changes(self):
        provider = mock.Mock()
        provider.get_changed_game_ids = mock.AsyncMock(
            return_value=[
                {"id": 201, "updated_at": 1700000000},
                {"id": 202, "updated_at": 1700000001},
            ]
        )
        with mock.patch.object(
            catalog_seed, "ensure_catalog_job", return_value=mock.Mock()
        ) as ensure_job:
            summary = _run(catalog_seed.enqueue_igdb_changes(limit=10, provider=provider))

        provider.get_changed_game_ids.assert_awaited_once()
        self.assertEqual(summary["discovered"], 2)
        self.assertEqual(summary["enqueued"], 2)
        self.assertEqual(ensure_job.call_count, 2)




class CatalogSeedDailyCommandTests(TestCase):
    def test_daily_source_whole_file_enqueues_and_drains(self):
        out = StringIO()
        summary = {
            "provider": "tmdb",
            "entity_type": "show",
            "discovered": 3,
            "enqueued": 2,
            "external_ids": ["1", "2"],
        }
        drain = {"ran": 1, "succeeded": 1, "failed": 0, "skipped": 0}
        with (
            mock.patch.object(
                catalog_seed, "enqueue_tmdb_daily", new=mock.AsyncMock(return_value=summary)
            ) as enqueue,
            mock.patch.object(catalog_seed, "run_pending_jobs", return_value=drain) as drain_jobs,
        ):
            call_command(
                "catalog_seed", kind="show", source="daily", limit=0, drain=True, stdout=out
            )

        enqueue.assert_awaited_once_with("show", limit=None)
        drain_jobs.assert_called_once_with(provider="tmdb", entity_type="show")
        self.assertIn("discovered 3 daily show ids", out.getvalue())
        self.assertIn("enqueued 2 new sync jobs", out.getvalue())

    def test_daily_source_honours_a_bounded_limit(self):
        summary = {"entity_type": "movie", "discovered": 5, "enqueued": 0}
        with mock.patch.object(
            catalog_seed,
            "enqueue_tmdb_daily",
            new=mock.AsyncMock(return_value=summary),
        ) as enqueue:
            call_command("catalog_seed", kind="movie", source="daily", limit=5, stdout=StringIO())
        enqueue.assert_awaited_once_with("movie", limit=5)

    def test_popular_source_still_rejects_zero_limit(self):
        with self.assertRaisesMessage(Exception, "--limit must be"):
            call_command("catalog_seed", source="popular", limit=0, stdout=StringIO())
