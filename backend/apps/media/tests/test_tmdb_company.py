"""Tests for the full company sync service (``apps.media.services.tmdb_company``).

Follow-driven: refresh a company's TMDB detail, discover every movie/tv title it
is involved in, and fan those ids out to the tmdb seed engine. The async paths
run their ORM writes via ``sync_to_async`` on a worker-thread connection, which
escapes ``TestCase``'s per-test rollback, so those use ``TransactionTestCase``
(truncation); the pure-provider/sync tests need no thread and run under
``TestCase``. Providers are mocked throughout — no network is touched.
"""

from __future__ import annotations

import asyncio
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, TransactionTestCase

from apps.company.models import Company
from apps.integrations.models import SyncJob
from apps.media.models import ExternalID
from apps.media.services import tmdb_company
from apps.media.services.tmdb_company import (
    discover_company_titles,
    enqueue_company_sync,
    fetch_and_seed_company,
    resolve_company_tmdb_id,
    upsert_company_from_tmdb,
)


def _run(coro):
    return asyncio.run(coro)


def _company_ct():
    return ContentType.objects.get_for_model(Company)


class UpsertCompanyTests(TestCase):
    def test_sets_fields_from_tmdb_payload(self):
        company = Company.objects.create(name="Old Name", slug="a24")

        result = upsert_company_from_tmdb(
            company,
            {
                "name": "A24",
                "logo_path": "/a24.png",
                "origin_country": "US",
                "description": "Indie studio",
                "homepage": "https://a24films.com",
            },
        )

        company.refresh_from_db()
        self.assertIs(result, company)
        self.assertEqual(company.name, "A24")
        self.assertEqual(company.logo_url, "https://image.tmdb.org/t/p/w185/a24.png")
        self.assertEqual(company.origin_country, "US")
        self.assertEqual(company.description, "Indie studio")
        self.assertEqual(company.homepage, "https://a24films.com")

    def test_missing_payload_values_keep_existing(self):
        company = Company.objects.create(
            name="A24",
            slug="a24",
            logo_url="https://example.test/logo.png",
            description="keep me",
            homepage="https://a24films.com",
        )

        upsert_company_from_tmdb(company, {"name": "", "logo_path": None})

        company.refresh_from_db()
        self.assertEqual(company.name, "A24")
        self.assertEqual(company.logo_url, "https://example.test/logo.png")
        self.assertEqual(company.description, "keep me")
        self.assertEqual(company.homepage, "https://a24films.com")

    def test_stored_tmdb_id_reads_the_external_id(self):
        company = Company.objects.create(name="A24", slug="a24")
        ExternalID.objects.create(
            content_type=_company_ct(),
            object_id=company.pk,
            provider="tmdb",
            external_id="61",
            media_type=None,
        )
        self.assertEqual(tmdb_company._stored_tmdb_id(company), 61)

    def test_get_or_create_matches_existing_by_tmdb_id(self):
        company = Company.objects.create(name="A24", slug="a24")
        ExternalID.objects.create(
            content_type=_company_ct(),
            object_id=company.pk,
            provider="tmdb",
            external_id="61",
            media_type=None,
        )

        found = tmdb_company._get_or_create_company(61, {"name": "A24"})

        self.assertEqual(found.pk, company.pk)
        self.assertEqual(Company.objects.count(), 1)

    def test_get_or_create_creates_by_slug_when_unmapped(self):
        found = tmdb_company._get_or_create_company(41077, {"name": "A24"})
        self.assertEqual(found.slug, "a24")


class ResolveCompanyTmdbIdTests(TransactionTestCase):
    def test_prefers_stored_external_id(self):
        company = Company.objects.create(name="A24", slug="a24")
        ExternalID.objects.create(
            content_type=_company_ct(),
            object_id=company.pk,
            provider="tmdb",
            external_id="61",
            media_type=None,
        )
        provider = mock.Mock()
        provider.search_company = mock.AsyncMock()

        self.assertEqual(_run(resolve_company_tmdb_id(company, provider=provider)), 61)
        provider.search_company.assert_not_awaited()

    def test_falls_back_to_exact_name_search_and_links_result(self):
        company = Company.objects.create(name="A24", slug="a24")
        provider = mock.Mock()
        provider.search_company = mock.AsyncMock(
            return_value={
                "results": [
                    {"id": 999, "name": "A24 Films"},
                    {"id": 61, "name": "a24"},
                ]
            }
        )

        self.assertEqual(_run(resolve_company_tmdb_id(company, provider=provider)), 61)
        self.assertTrue(
            ExternalID.objects.filter(
                content_type=_company_ct(),
                object_id=company.pk,
                provider="tmdb",
                external_id="61",
            ).exists()
        )

    def test_lone_search_result_is_accepted(self):
        company = Company.objects.create(name="A24", slug="a24")
        provider = mock.Mock()
        provider.search_company = mock.AsyncMock(
            return_value={"results": [{"id": 61, "name": "A24 Productions"}]}
        )

        self.assertEqual(_run(resolve_company_tmdb_id(company, provider=provider)), 61)

    def test_no_match_returns_none(self):
        company = Company.objects.create(name="A24", slug="a24")
        provider = mock.Mock()
        provider.search_company = mock.AsyncMock(
            return_value={
                "results": [
                    {"id": 999, "name": "A24 Films"},
                    {"id": 1000, "name": "Another Studio"},
                ]
            }
        )

        self.assertIsNone(_run(resolve_company_tmdb_id(company, provider=provider)))


class DiscoverCompanyTitlesTests(TestCase):
    def test_pages_until_total_pages_and_maps_tv_to_show(self):
        provider = mock.Mock()

        async def discover(media_type, params):
            page = int(params["page"])
            if media_type == "movie":
                return {
                    1: {"results": [{"id": 1}, {"id": 2}], "total_pages": 2},
                    2: {"results": [{"id": 3}], "total_pages": 2},
                }[page]
            return {"results": [{"id": 10}], "total_pages": 1}

        provider.discover = mock.AsyncMock(side_effect=discover)

        titles = _run(discover_company_titles(61, provider=provider))

        self.assertEqual(titles, {"movie": ["1", "2", "3"], "show": ["10"]})
        # with_companies carries the company id on every discover call.
        for call in provider.discover.await_args_list:
            self.assertEqual(call.args[1]["with_companies"], "61")

    def test_empty_first_page_stops_immediately(self):
        provider = mock.Mock()
        provider.discover = mock.AsyncMock(return_value={"results": [], "total_pages": 5})

        titles = _run(discover_company_titles(61, provider=provider))

        self.assertEqual(titles, {"movie": [], "show": []})
        self.assertEqual(provider.discover.await_count, 2)  # one movie + one tv


class FetchAndSeedCompanyTests(TransactionTestCase):
    def test_refreshes_company_and_enqueues_unseen_titles(self):
        provider = mock.Mock()
        provider.get_company = mock.AsyncMock(
            return_value={
                "name": "A24",
                "logo_path": "/a24.png",
                "origin_country": "US",
                "description": "Indie studio",
                "homepage": "https://a24films.com",
            }
        )

        async def discover(media_type, params):
            if media_type == "movie":
                return {"results": [{"id": 1}], "total_pages": 1}
            return {"results": [{"id": 10}], "total_pages": 1}

        provider.discover = mock.AsyncMock(side_effect=discover)

        movie_job = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="1", status="pending"
        )
        show_job = SyncJob.objects.create(
            provider="tmdb", entity_type="show", external_id="10", status="pending"
        )

        def fake_enqueue(**kwargs):
            return {"movie": [movie_job], "show": [show_job]}[kwargs["entity_type"]]

        with mock.patch(
            "apps.media.services.tmdb_company.enqueue_seed_jobs", side_effect=fake_enqueue
        ) as enqueue:
            summary = _run(fetch_and_seed_company(61, provider=provider))

        company = Company.objects.get(slug="a24")
        self.assertEqual(company.description, "Indie studio")
        self.assertEqual(company.homepage, "https://a24films.com")
        self.assertTrue(
            ExternalID.objects.filter(
                content_type=_company_ct(), object_id=company.pk, external_id="61"
            ).exists()
        )
        self.assertEqual(summary["enqueued"], 2)
        self.assertEqual(sorted(summary["child_job_ids"]), sorted([movie_job.pk, show_job.pk]))

        movie_call = next(c for c in enqueue.call_args_list if c.kwargs["entity_type"] == "movie")
        self.assertFalse(movie_call.kwargs["is_bulk"])
        self.assertEqual(movie_call.kwargs["external_ids"], ["1"])


class EnqueueCompanySyncTests(TransactionTestCase):
    def test_creates_and_dispatches_a_company_job(self):
        company = Company.objects.create(name="A24", slug="a24")
        with (
            mock.patch.object(
                tmdb_company, "resolve_company_tmdb_id", new=mock.AsyncMock(return_value=61)
            ),
            mock.patch("apps.integrations.tasks.run_sync_job") as run,
        ):
            job = enqueue_company_sync(company)

        self.assertIsNotNone(job)
        self.assertEqual(job.provider, "tmdb")
        self.assertEqual(job.entity_type, "company")
        self.assertEqual(job.external_id, "61")
        self.assertFalse(job.is_bulk)
        run.delay.assert_called_once_with(job.pk)

    def test_dedupes_against_a_live_company_job(self):
        company = Company.objects.create(name="A24", slug="a24")
        SyncJob.objects.create(
            provider="tmdb", entity_type="company", external_id="61", status="running"
        )
        with (
            mock.patch.object(
                tmdb_company, "resolve_company_tmdb_id", new=mock.AsyncMock(return_value=61)
            ),
            mock.patch("apps.integrations.tasks.run_sync_job") as run,
        ):
            job = enqueue_company_sync(company)

        self.assertIsNone(job)
        run.delay.assert_not_called()

    def test_no_resolvable_id_is_a_noop(self):
        company = Company.objects.create(name="Mystery", slug="mystery")
        with (
            mock.patch.object(
                tmdb_company, "resolve_company_tmdb_id", new=mock.AsyncMock(return_value=None)
            ),
            mock.patch("apps.integrations.tasks.run_sync_job") as run,
        ):
            job = enqueue_company_sync(company)

        self.assertIsNone(job)
        self.assertEqual(SyncJob.objects.count(), 0)
        run.delay.assert_not_called()

    def test_resolution_failure_is_swallowed(self):
        company = Company.objects.create(name="A24", slug="a24")
        with mock.patch.object(
            tmdb_company,
            "resolve_company_tmdb_id",
            new=mock.AsyncMock(side_effect=RuntimeError("boom")),
        ):
            self.assertIsNone(enqueue_company_sync(company))
