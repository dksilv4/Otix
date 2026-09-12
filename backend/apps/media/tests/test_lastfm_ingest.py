"""Tests for the Last.fm album enrich service (``apps.media.services.lastfm_ingest``).

DB-touching pieces run as sync ``TestCase`` against the real (test) database:
the pure extractors, ``_album_context``'s DB read, and the idempotent
``apply_album_enrichment`` write. The async driver (``lastfm_enrich_album``)
runs its DB read/write via ``sync_to_async`` on a worker-thread connection that
escapes ``TestCase``'s per-test rollback, so its async tests stub
``_album_context``/``apply_album_enrichment`` and assert call patterns instead.
``core.providers.lastfm.LastFMProvider`` is exercised over an
``httpx.MockTransport`` (the api_key rides the query string; the token bucket
runs on an in-memory Redis double).
"""

from __future__ import annotations

import asyncio
from unittest import mock

import httpx
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.media.models import ExternalID, ExternalRating, MediaItem
from apps.media.models.genre import Genre, MediaGenre
from apps.media.services.completeness import completeness_flags
from apps.media.services.lastfm_ingest import (
    _album_context,
    _clean_summary,
    apply_album_enrichment,
    extract_tags,
    extract_wiki_summary,
    lastfm_enrich_album,
)
from apps.people.models import MediaCredit, Person
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.lastfm import BASE_URL, LastFMProvider

MBID = "f34d9f2b-0c9e-4f3a-8a2e-9e6d2b1c3d4f"


def _run(coro):
    return asyncio.run(coro)


def _media(**overrides):
    fields = dict(media_type="music", title="Kid A", slug="kid-a")
    fields.update(overrides)
    return MediaItem.objects.create(**fields)


def _album_info(**overrides):
    info = {
        "artist": "Radiohead",
        "name": "Kid A",
        "playcount": "1234567",
        "listeners": "89012",
        "wiki": {
            "summary": (
                "Kid A is the fourth studio album by Radiohead. "
                '<a href="https://www.last.fm/music/Radiohead/Kid+A">Read more on Last.fm</a>'
            )
        },
        "tags": {"tag": [{"name": "electronic"}, {"name": "rock"}, {"name": "alternative"}]},
    }
    info.update(overrides)
    return info


def _media_ct():
    return ContentType.objects.get_for_model(MediaItem)


def _add_primary_artist(media, name="Radiohead"):
    person = Person.objects.create(name=name)
    return MediaCredit.objects.create(media_item=media, person=person, role="primary")


def _add_mbid(media, mbid=MBID):
    ExternalID.objects.create(
        content_type=_media_ct(),
        object_id=media.pk,
        provider="musicbrainz",
        external_id=mbid,
        media_type="music",
    )


# ── In-memory async Redis double (token-bucket script transcription) ──


class _FakeScript:
    """Grant token-bucket acquisition over ``redis.storage``."""

    def __init__(self, redis):
        self._redis = redis

    async def __call__(self, *, keys=None, args=None):
        key = keys[0]
        now, rate, burst, requested = (float(a) for a in args)
        tokens = burst - requested
        self._redis.storage[f"{key}:tokens"] = tokens
        self._redis.storage[f"{key}:last"] = now
        return [1, str(tokens), "0.0"]


class FakeAsyncRedis:
    def __init__(self):
        self.storage: dict[str, object] = {}

    def register_script(self, script):
        return _FakeScript(self)

    async def get(self, key):
        return self.storage.get(key)

    async def set(self, key, value, ex=None):
        self.storage[key] = value

    async def setex(self, key, seconds, value):
        self.storage[key] = value

    async def delete(self, *keys):
        for key in keys:
            self.storage.pop(key, None)
        return len(keys)

    async def ttl(self, key):
        return -1


class LastfmExtractorTests(TestCase):
    def test_clean_summary_strips_html_and_read_more_link(self):
        self.assertEqual(
            _clean_summary(
                "Kid A is the fourth album. "
                '<a href="https://www.last.fm/music/Radiohead/Kid+A">Read more on Last.fm</a>'
            ),
            "Kid A is the fourth album.",
        )

    def test_wiki_summary_extracted_and_cleaned(self):
        info = _album_info()
        summary = extract_wiki_summary(info)
        self.assertEqual(summary, "Kid A is the fourth studio album by Radiohead.")

    def test_wiki_summary_none_when_absent_or_blank(self):
        self.assertIsNone(extract_wiki_summary({"wiki": {}}))
        self.assertIsNone(extract_wiki_summary({"wiki": {"summary": "   "}}))
        self.assertIsNone(extract_wiki_summary({}))

    def test_tags_read_from_tags_and_toptags_containers(self):
        tags = extract_tags(_album_info())
        self.assertEqual(tags, ["electronic", "rock", "alternative"])
        alt = _album_info(wiki=None)
        alt["toptags"] = {"tag": [{"name": "indie"}]}
        alt.pop("tags")
        self.assertEqual(extract_tags(alt), ["indie"])
        self.assertEqual(extract_tags({}), [])


class LastfmAlbumContextTests(TestCase):
    def test_none_without_a_primary_artist_credit(self):
        media = _media()
        self.assertIsNone(_album_context(media.pk))

    def test_resolves_primary_artist_title_and_mbid(self):
        media = _media()
        _add_primary_artist(media)
        _add_mbid(media)
        context = _album_context(media.pk)
        self.assertEqual(context["artist"], "Radiohead")
        self.assertEqual(context["title"], "Kid A")
        self.assertEqual(context["mbid"], MBID)


class ApplyAlbumEnrichmentTests(TestCase):
    def test_wiki_tags_and_ratings_are_applied(self):
        media = _media()
        changed = apply_album_enrichment(media.pk, _album_info())

        self.assertTrue(changed)
        media.refresh_from_db()
        self.assertEqual(media.overview, "Kid A is the fourth studio album by Radiohead.")
        self.assertTrue(completeness_flags(media)["has_overview"])
        self.assertTrue(completeness_flags(media)["has_genres"])

        names = set(
            Genre.objects.filter(media_genres__media_item=media).values_list("name", flat=True)
        )
        self.assertEqual(names, {"electronic", "rock", "alternative"})
        self.assertEqual(MediaGenre.objects.filter(media_item=media).count(), 3)

        rows = {r.provider: r for r in ExternalRating.objects.filter(media_item=media)}
        self.assertEqual(set(rows), {"lastfm", "lastfm_listeners"})
        self.assertEqual(rows["lastfm"].score, 1234567.0)
        self.assertEqual(rows["lastfm"].max_score, 1_000_000)
        self.assertEqual(rows["lastfm_listeners"].score, 89012.0)
        self.assertEqual(rows["lastfm_listeners"].max_score, 100_000)

    def test_existing_overview_is_not_overwritten(self):
        media = _media(overview="existing overview")
        changed = apply_album_enrichment(media.pk, _album_info())
        media.refresh_from_db()
        self.assertEqual(media.overview, "existing overview")
        self.assertTrue(changed)  # tags/ratings still landed

    def test_rerun_is_idempotent(self):
        media = _media()
        apply_album_enrichment(media.pk, _album_info())
        changed = apply_album_enrichment(media.pk, _album_info())
        self.assertFalse(changed)
        self.assertEqual(MediaGenre.objects.filter(media_item=media).count(), 3)
        self.assertEqual(ExternalRating.objects.filter(media_item=media).count(), 2)

    def test_listeners_absent_skips_that_row(self):
        media = _media()
        info = _album_info(listeners="0")
        apply_album_enrichment(media.pk, info)
        providers = set(
            ExternalRating.objects.filter(media_item=media).values_list("provider", flat=True)
        )
        self.assertEqual(providers, {"lastfm"})

    def test_no_usable_payload_is_a_noop(self):
        media = _media()
        changed = apply_album_enrichment(media.pk, {"wiki": {}, "tags": {}, "playcount": "0"})
        self.assertFalse(changed)
        self.assertFalse(ExternalRating.objects.filter(media_item=media).exists())


class LastfmEnrichAlbumTests(TestCase):
    """Async driver: context resolution + Last.fm fetch + sync apply.

    The two DB-backed helpers run through ``sync_to_async`` on a worker thread,
    where a ``TestCase`` transaction isn't visible, so they're stubbed to keep
    each branch deterministic; their real DB behavior is covered by the sync
    ``LastfmAlbumContextTests``/``ApplyAlbumEnrichmentTests`` classes above.
    """

    def setUp(self):
        self.media = _media()

    def _provider(self, info=None):
        provider = mock.Mock()
        provider.album_get_info = mock.AsyncMock(return_value=info)
        return provider

    def _context(self):
        return {"artist": "Radiohead", "title": "Kid A", "mbid": MBID}

    def test_unconfigured_key_skips_everything(self):
        provider = self._provider()
        with override_settings(LASTFM_API_KEY=""), mock.patch(
            "apps.media.services.lastfm_ingest._album_context", return_value=self._context()
        ):
            result = _run(lastfm_enrich_album(self.media.pk, provider=provider))

        provider.album_get_info.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "unconfigured")

    def test_fetches_and_applies_album_info(self):
        provider = self._provider(_album_info())
        with override_settings(LASTFM_API_KEY="test-key"), mock.patch(
            "apps.media.services.lastfm_ingest._album_context", return_value=self._context()
        ), mock.patch(
            "apps.media.services.lastfm_ingest.apply_album_enrichment", return_value=True
        ) as apply:
            result = _run(lastfm_enrich_album(self.media.pk, provider=provider))

        provider.album_get_info.assert_awaited_once_with(
            artist="Radiohead", album="Kid A", mbid=MBID
        )
        apply.assert_called_once_with(self.media.pk, _album_info())
        self.assertTrue(result["enriched"])
        self.assertIsNone(result["reason"])

    def test_no_context_is_benign_noop(self):
        provider = self._provider()
        with override_settings(LASTFM_API_KEY="test-key"), mock.patch(
            "apps.media.services.lastfm_ingest._album_context", return_value=None
        ):
            result = _run(lastfm_enrich_album(self.media.pk, provider=provider))

        provider.album_get_info.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no context")

    def test_provider_miss_is_benign_noop(self):
        provider = self._provider(None)
        with override_settings(LASTFM_API_KEY="test-key"), mock.patch(
            "apps.media.services.lastfm_ingest._album_context", return_value=self._context()
        ), mock.patch(
            "apps.media.services.lastfm_ingest.apply_album_enrichment"
        ) as apply:
            result = _run(lastfm_enrich_album(self.media.pk, provider=provider))

        provider.album_get_info.assert_awaited_once()
        apply.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no result")


class LastFMProviderTests(TestCase):
    """Client transport: api_key/method params + error-envelope miss -> None."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def _client(self, handler):
        transport = httpx.MockTransport(handler=handler)
        return LastFMProvider(
            redis=FakeAsyncRedis(),
            http_client=httpx.AsyncClient(transport=transport, base_url=BASE_URL),
        )

    def test_album_get_info_sends_params_and_returns_album(self):
        info = _album_info()

        def handler(request):
            params = request.url.params
            self.assertEqual(params["method"], "album.getinfo")
            self.assertEqual(params["api_key"], "test-key")
            self.assertEqual(params["artist"], "Radiohead")
            self.assertEqual(params["album"], "Kid A")
            self.assertEqual(params["mbid"], MBID)
            return httpx.Response(200, json={"album": info})

        with override_settings(LASTFM_API_KEY="test-key"):
            result = _run(self._client(handler).album_get_info("Radiohead", "Kid A", mbid=MBID))

        self.assertEqual(result["name"], "Kid A")

    def test_error_envelope_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(200, json={"error": 6, "message": "album not found"})

        with override_settings(LASTFM_API_KEY="test-key"):
            result = _run(self._client(handler).album_get_info("Radiohead", "Missing"))

        self.assertIsNone(result)

    def test_non_200_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(503, text="unavailable")

        with override_settings(LASTFM_API_KEY="test-key"):
            result = _run(self._client(handler).album_get_info("Radiohead", "Kid A"))

        self.assertIsNone(result)
