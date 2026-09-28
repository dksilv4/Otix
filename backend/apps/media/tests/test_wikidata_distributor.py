"""Tests for the Wikidata distributor enrich service.

DB-touching pieces run as sync ``TestCase`` against the real (test) database:
the pure ``_selector``/``_parse_bindings`` helpers, and the idempotent
``attach_distributors`` write (TMDB-id match, slug match, create, re-run no-op).
The async driver runs its DB reads/writes via ``sync_to_async`` on a worker-thread
connection that escapes ``TestCase``'s per-test rollback, so its tests stub
``_stored_ids``/``fetch_distributors``/``attach_distributors`` and assert call
patterns instead. ``fetch_distributors`` itself is exercised over an
``httpx.MockTransport`` client injected into the call.
"""

from __future__ import annotations

import asyncio
from unittest import mock

import httpx
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.company.models import Company, InvolvedCompany
from apps.media.models import ExternalID, MediaItem
from apps.media.services.wikidata_distributor import (
    _parse_bindings,
    _selector,
    attach_distributors,
    fetch_distributors,
    wikidata_enrich_distributors,
)


def _run(coro):
    return asyncio.run(coro)


def _payload(pairs):
    """A WDQS-shaped payload from ``(label, tmdb_company_id)`` pairs."""
    bindings = []
    for name, tmdb in pairs:
        binding = {"distLabel": {"value": name}}
        if tmdb is not None:
            binding["tmdbCompany"] = {"value": str(tmdb)}
        bindings.append(binding)
    return {"results": {"bindings": bindings}}


def _client(payload):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _media(slug: str = "the-death-of-robin-hood") -> MediaItem:
    return MediaItem.objects.create(media_type="movie", title="The Death of Robin Hood", slug=slug)


def _link_media_id(media: MediaItem, provider: str, external_id: str) -> None:
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media.pk,
        provider=provider,
        external_id=external_id,
        media_type="movie",
    )


# ── Pure helpers ──────────────────────────────────────────────────────────


class SelectorTests(TestCase):
    def test_prefers_imdb_id(self) -> None:
        selector = _selector("tt32273171", 1284465)
        self.assertIn("P345", selector)
        self.assertIn("tt32273171", selector)

    def test_falls_back_to_tmdb_id(self) -> None:
        selector = _selector(None, 1284465)
        self.assertIn("P4947", selector)

    def test_none_when_no_usable_id(self) -> None:
        self.assertIsNone(_selector(None, None))
        self.assertIsNone(_selector("not-an-imdb-id", None))


class ParseBindingsTests(TestCase):
    def test_dedupes_and_parses_tmdb_ids(self) -> None:
        specs = _parse_bindings(_payload([("A24", None), ("A24", None), ("Lyrical Media", 180839)]))
        self.assertEqual(
            specs,
            [
                {"name": "A24", "tmdb_company_id": None},
                {"name": "Lyrical Media", "tmdb_company_id": 180839},
            ],
        )

    def test_skips_unlabelled_and_bad_tmdb(self) -> None:
        specs = _parse_bindings({"results": {"bindings": [{"tmdbCompany": {"value": "5"}}]}})
        self.assertEqual(specs, [])


# ── fetch_distributors over a mocked transport ─────────────────────────────


class FetchDistributorsTests(TestCase):
    def test_returns_specs(self) -> None:
        client = _client(_payload([("A24", None)]))
        specs = _run(fetch_distributors(imdb_id="tt32273171", client=client))
        self.assertEqual(specs, [{"name": "A24", "tmdb_company_id": None}])
        _run(client.aclose())

    def test_no_ids_makes_no_request(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise AssertionError("no request expected")

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.assertEqual(_run(fetch_distributors(client=client)), [])
        _run(client.aclose())


# ── attach_distributors ────────────────────────────────────────────────────


class AttachDistributorsTests(TestCase):
    def test_creates_company_and_link(self) -> None:
        media = _media()
        linked = attach_distributors(media.pk, [{"name": "A24", "tmdb_company_id": None}])
        self.assertEqual(linked, 1)
        company = Company.objects.get(slug="a24")
        row = InvolvedCompany.objects.get(media_item=media, company=company)
        self.assertTrue(row.distributor)
        self.assertFalse(row.production)

    def test_reuses_company_matched_by_tmdb_id(self) -> None:
        media = _media()
        company = Company.objects.create(name="A24", slug="a24-films")
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(Company),
            object_id=company.pk,
            provider="tmdb",
            external_id="41077",
        )
        linked = attach_distributors(media.pk, [{"name": "A24", "tmdb_company_id": 41077}])
        self.assertEqual(linked, 1)
        self.assertEqual(InvolvedCompany.objects.get(media_item=media).company_id, company.pk)

    def test_rerun_is_idempotent(self) -> None:
        media = _media()
        specs = [{"name": "A24", "tmdb_company_id": None}]
        attach_distributors(media.pk, specs)
        self.assertEqual(attach_distributors(media.pk, specs), 0)
        self.assertEqual(InvolvedCompany.objects.filter(media_item=media).count(), 1)

    def test_promotes_existing_production_row_to_distributor(self) -> None:
        media = _media()
        company = Company.objects.create(name="A24", slug="a24")
        InvolvedCompany.objects.create(media_item=media, company=company, production=True)
        self.assertEqual(attach_distributors(media.pk, [{"name": "A24"}]), 1)
        row = InvolvedCompany.objects.get(media_item=media, company=company)
        self.assertTrue(row.distributor)
        self.assertTrue(row.production)

    def test_empty_specs_is_noop(self) -> None:
        self.assertEqual(attach_distributors(_media().pk, []), 0)


# ── async driver (DB reads/writes stubbed) ─────────────────────────────────


class EnrichDistributorsDriverTests(TestCase):
    @override_settings(WIKIDATA_DISTRIBUTOR_ENRICH=False)
    def test_disabled_is_noop(self) -> None:
        result = _run(wikidata_enrich_distributors(1))
        self.assertEqual(result["reason"], "disabled")
        self.assertFalse(result["enriched"])

    @mock.patch("apps.media.services.wikidata_distributor._stored_ids", return_value=(None, None))
    def test_no_provider_id_is_noop(self, _stored) -> None:
        result = _run(wikidata_enrich_distributors(1))
        self.assertEqual(result["reason"], "no provider id")

    @mock.patch("apps.media.services.wikidata_distributor.attach_distributors", return_value=1)
    @mock.patch(
        "apps.media.services.wikidata_distributor.fetch_distributors",
        new_callable=mock.AsyncMock,
        return_value=[{"name": "A24", "tmdb_company_id": None}],
    )
    @mock.patch(
        "apps.media.services.wikidata_distributor._stored_ids",
        return_value=("tt32273171", None),
    )
    def test_fetches_then_attaches(self, _stored, fetch, attach) -> None:
        result = _run(wikidata_enrich_distributors(7))
        self.assertTrue(result["enriched"])
        self.assertEqual(result["linked"], 1)
        attach.assert_called_once_with(7, [{"name": "A24", "tmdb_company_id": None}])
