"""Auto artwork mirroring gated by the ``is_bulk`` marker on ingest paths.

Covers the two places a freshly-fetched title should mirror its artwork —
``execute_sync_job`` (server single-title syncs) and ``complete_from_client``
(proxy-fetch client results) — asserting the mirror helper fires for on-demand
(non-bulk) jobs and stays silent for ``is_bulk`` catalog backfills, plus the
``is_bulk`` marker itself on both enqueue paths. The mirror helper itself is
unit-tested in ``apps.media.tests.test_assets``, so here it is mocked.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.integrations.models import SyncJob
from apps.integrations.services import (
    catalog_seed,
    fetch_result,
    register_sync_engine,
)
from apps.integrations.services.sync import enqueue_sync_job, execute_sync_job
from apps.integrations.tests._sse_fakes import FakeRedis

User = get_user_model()

MIRROR_PATCH = "apps.media.services.assets.mirror_media_artwork"


@register_sync_engine("mirrored")
def _mirrored_engine(job: SyncJob) -> dict:
    """Single-title fetch engine: reports the seeded ``media_item_id``."""
    return {"media_item_id": 42, "counts": {"added": 1, "updated": 0}}


@register_sync_engine("mirror_none")
def _no_media_engine(job: SyncJob) -> dict:
    """Engine whose summary carries no media id (nothing to mirror)."""
    return {"counts": {"added": 0, "updated": 0}}


class SeedEnqueueIsBulkTests(TestCase):
    """Bulk seed jobs carry the ``is_bulk`` marker; single-title jobs don't."""

    def test_enqueue_seed_jobs_marks_created_jobs_bulk(self) -> None:
        created = catalog_seed.enqueue_seed_jobs(
            provider="tmdb",
            entity_type="movie",
            external_ids=["1", "2"],
        )
        self.assertEqual(len(created), 2)
        self.assertTrue(all(job.is_bulk for job in created))

    def test_enqueue_sync_job_leaves_is_bulk_false(self) -> None:
        job = enqueue_sync_job(provider="tmdb", entity_type="movie", external_id="550")
        self.assertFalse(job.is_bulk)


class SyncIngestMirrorTests(TestCase):
    """``execute_sync_job`` mirrors artwork for non-bulk single-title fetches."""

    def setUp(self) -> None:
        self.fake = FakeRedis()
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch("core.sse.get_client", return_value=self.fake),
            mock.patch("core.sse.get_async_client", return_value=self.fake),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def _run(self, provider: str, *, is_bulk: bool = False) -> dict:
        job = SyncJob.objects.create(
            provider=provider,
            entity_type="movie",
            external_id="550",
            status="pending",
            is_bulk=is_bulk,
        )
        return execute_sync_job(job.pk)

    def test_single_title_fetch_mirrors_artwork(self) -> None:
        with mock.patch(MIRROR_PATCH) as mirror:
            outcome = self._run("mirrored")

        self.assertEqual(outcome["status"], "success")
        mirror.assert_called_once_with(42)

    def test_bulk_job_skips_artwork_mirroring(self) -> None:
        with mock.patch(MIRROR_PATCH) as mirror:
            outcome = self._run("mirrored", is_bulk=True)

        self.assertEqual(outcome["status"], "success")
        mirror.assert_not_called()

    def test_engine_without_media_id_skips_mirroring(self) -> None:
        with mock.patch(MIRROR_PATCH) as mirror:
            outcome = self._run("mirror_none")

        self.assertEqual(outcome["status"], "success")
        mirror.assert_not_called()


class FetchResultMirrorTests(TestCase):
    """``complete_from_client`` mirrors artwork on client-driven results."""

    def setUp(self) -> None:
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.fake = FakeRedis()
        self.mirror = mock.Mock(return_value=True)
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch.dict(
                fetch_result._SEEDERS,
                {("fanart", "movie"): self._stub_seeder()},
            ),
            mock.patch(MIRROR_PATCH, self.mirror),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def _stub_seeder(self):
        def seeder(job, raw):
            return 42

        return seeder

    def _post_result(self, *, is_bulk: bool = False):
        job = SyncJob.objects.create(
            provider="fanart",
            entity_type="movie",
            external_id="550",
            status="awaiting_client",
            user=self.owner,
            is_bulk=is_bulk,
        )
        return self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "movie",
                "raw": {"title": "Twin Peaks"},
            },
            format="json",
        )

    def test_client_result_mirrors_non_bulk_job(self) -> None:
        resp = self._post_result()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["media_id"], 42)
        self.mirror.assert_called_once_with(42)

    def test_client_result_skips_bulk_job(self) -> None:
        resp = self._post_result(is_bulk=True)
        self.assertEqual(resp.status_code, 200)
        self.mirror.assert_not_called()
