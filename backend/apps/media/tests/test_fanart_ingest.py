"""Tests for the Fanart.tv movie/show artwork enrich service.

Target module: ``apps.media.services.fanart_ingest``.


DB-touching pieces run as sync ``TestCase`` against the real (test) database:
the pure ``_fanart_assets`` extractor, ``_context``'s DB read (media type +
tmdb/tvdb ExternalID), and the idempotent ``_apply_assets`` write. The async
driver (``fanart_enrich_images``) runs its DB read/write via ``sync_to_async``
on a worker-thread connection that escapes ``TestCase``'s per-test rollback, so
its async tests stub ``_context``/``_apply_assets`` and assert call patterns
instead. ``core.providers.fanart.FanartProvider`` is exercised over an
``httpx.MockTransport`` (the api_key rides the query string; the token bucket
runs on an in-memory Redis double). The music endpoint is not ported (2026-09-07
audio scope cut) — only movie/show artwork is covered.
"""

from __future__ import annotations

import asyncio
from unittest import mock

import httpx
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.completeness import completeness_flags
from apps.media.services.fanart_ingest import (
    _apply_assets,
    _context,
    _fanart_assets,
    fanart_enrich_images,
)
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.fanart import BASE_URL, FanartProvider

TMDB_ID = 550
TVDB_ID = 73713


def _run(coro):
    return asyncio.run(coro)


def _media(media_type="movie", **overrides):
    fields = dict(media_type=media_type, title="Fight Club", slug="fight-club")
    fields.update(overrides)
    return MediaItem.objects.create(**fields)


def _media_ct():
    return ContentType.objects.get_for_model(MediaItem)


def _add_external(media, provider, external_id, media_type="movie"):
    return ExternalID.objects.create(
        content_type=_media_ct(),
        object_id=media.pk,
        provider=provider,
        external_id=external_id,
        media_type=media_type,
    )


def _entry(url, lang=None, width=None, height=None):
    entry = {"url": url, "lang": lang}
    if width is not None:
        entry["width"] = width
    if height is not None:
        entry["height"] = height
    return entry


def _movie_art():
    return {
        "hdmovielogo": [
            _entry("https://a.fanart.tv/art/movies/550/hdmovielogo/1.png", lang="en")
        ],
        "movielogo": [
            _entry("https://a.fanart.tv/art/movies/550/movielogo/1.png", lang="")
        ],
        "movieposter": [
            _entry("https://a.fanart.tv/art/movies/550/movieposter/1.png", lang="en"),
            _entry("https://a.fanart.tv/art/movies/550/movieposter/2.png", lang="zxx"),
        ],
        "moviebackground": [
            _entry("https://a.fanart.tv/art/movies/550/moviebackground/1.png", lang="en")
        ],
    }


def _show_art():
    return {
        "hdtvlogo": [_entry("https://a.fanart.tv/art/tv/73713/hdtvlogo/1.png", lang="en")],
        "clearlogo": [
            _entry("https://a.fanart.tv/art/tv/73713/clearlogo/1.png", lang="en")
        ],
        "tvposter": [
            _entry("https://a.fanart.tv/art/tv/73713/tvposter/1.png", lang="en"),
            _entry("https://a.fanart.tv/art/tv/73713/tvposter/2.png", lang="00"),
        ],
        "seasonposter": [
            _entry("https://a.fanart.tv/art/tv/73713/seasonposter/1.png", lang="en")
        ],
        "showbackground": [
            _entry("https://a.fanart.tv/art/tv/73713/showbackground/1.png", lang="en")
        ],
    }


def _types(rows):
    return {r["asset_type"] for r in rows}


def _row_by_url(rows, fragment):
    for row in rows:
        if fragment in row["url"]:
            return row
    return None


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


class FanartAssetExtractorTests(TestCase):
    def test_movie_categories_map_to_tracked_families(self):
        rows = _fanart_assets(_movie_art(), _MOVIE_CATEGORIES_FOR_TEST())
        self.assertEqual(_types(rows), {"logo", "poster", "textless_poster", "backdrop"})
        self.assertEqual(len([r for r in rows if r["asset_type"] == "logo"]), 2)
        self.assertEqual(len([r for r in rows if r["asset_type"] == "poster"]), 1)
        self.assertEqual(len([r for r in rows if r["asset_type"] == "textless_poster"]), 1)

    def test_language_neutral_poster_is_textless(self):
        rows = _fanart_assets(_movie_art(), _MOVIE_CATEGORIES_FOR_TEST())
        textless = _row_by_url(rows, "movieposter/2")
        self.assertEqual(textless["asset_type"], "textless_poster")
        self.assertIsNone(textless["lang"])

    def test_english_poster_stays_poster(self):
        rows = _fanart_assets(_movie_art(), _MOVIE_CATEGORIES_FOR_TEST())
        poster = _row_by_url(rows, "movieposter/1")
        self.assertEqual(poster["asset_type"], "poster")
        self.assertEqual(poster["lang"], "en")

    def test_show_categories_map_clearlogo_and_seasonposter(self):
        rows = _fanart_assets(_show_art(), _SHOW_CATEGORIES_FOR_TEST())
        self.assertEqual(_types(rows), {"logo", "poster", "textless_poster", "backdrop"})
        self.assertEqual(len([r for r in rows if r["asset_type"] == "logo"]), 2)
        self.assertEqual(len([r for r in rows if r["asset_type"] == "poster"]), 2)

    def test_same_url_across_categories_is_deduped(self):
        art = {
            "hdmovielogo": [_entry("https://a.fanart.tv/logo.png", lang="en")],
            "movielogo": [_entry("https://a.fanart.tv/logo.png", lang="en")],
        }
        rows = _fanart_assets(art, _MOVIE_CATEGORIES_FOR_TEST())
        self.assertEqual(len(rows), 1)

    def test_blank_url_and_non_dict_entries_skipped(self):
        art = {
            "hdmovielogo": [
                {"url": ""},
                "not-a-dict",
                {"url": "https://a.fanart.tv/ok.png", "lang": "en"},
            ]
        }
        rows = _fanart_assets(art, _MOVIE_CATEGORIES_FOR_TEST())
        self.assertEqual([r["url"] for r in rows], ["https://a.fanart.tv/ok.png"])

    def test_rows_capped_per_type(self):
        art = {"hdmovielogo": [_entry(f"https://a.fanart.tv/logo/{i}.png") for i in range(20)]}
        rows = _fanart_assets(art, _MOVIE_CATEGORIES_FOR_TEST(), max_per_type=5)
        self.assertEqual(len(rows), 5)


def _MOVIE_CATEGORIES_FOR_TEST():
    from apps.media.services.fanart_ingest import _MOVIE_CATEGORIES

    return _MOVIE_CATEGORIES


def _SHOW_CATEGORIES_FOR_TEST():
    from apps.media.services.fanart_ingest import _SHOW_CATEGORIES

    return _SHOW_CATEGORIES


class FanartContextTests(TestCase):
    def test_none_for_non_movie_show_row(self):
        game = _media(media_type="game", slug="hades", title="Hades")
        self.assertIsNone(_context(game.pk))

    def test_movie_resolves_kind_and_tmdb_id(self):
        media = _media()
        _add_external(media, "tmdb", str(TMDB_ID))
        context = _context(media.pk)
        self.assertEqual(context, {"kind": "movie", "lookup_id": TMDB_ID})

    def test_show_resolves_kind_and_tvdb_id(self):
        media = _media(media_type="show", slug="breaking-bad", title="Breaking Bad")
        _add_external(media, "tmdb", "1396", media_type="show")
        _add_external(media, "tvdb", str(TVDB_ID), media_type="show")
        context = _context(media.pk)
        self.assertEqual(context, {"kind": "show", "lookup_id": TVDB_ID})

    def test_none_when_no_usable_lookup_id(self):
        media = _media()
        self.assertIsNone(_context(media.pk))
        _add_external(media, "tmdb", "not-a-number")
        self.assertIsNone(_context(media.pk))


class ApplyFanartAssetsTests(TestCase):
    def test_rows_stored_with_provider_and_idempotent(self):
        media = _media()
        rows = _fanart_assets(_movie_art(), _MOVIE_CATEGORIES_FOR_TEST())
        first = _apply_assets(media.pk, rows)
        self.assertEqual(first, 5)
        second = _apply_assets(media.pk, rows)
        self.assertEqual(second, 0)
        assets = MediaAsset.objects.filter(media_item=media)
        self.assertEqual(assets.count(), 5)
        self.assertTrue(assets.filter(asset_type="logo").exists())
        self.assertTrue(
            all(a.provider == "fanart" for a in assets)
        )

    def test_adding_logo_and_textless_flips_completeness_flags(self):
        media = _media()
        rows = _fanart_assets(_movie_art(), _MOVIE_CATEGORIES_FOR_TEST())
        _apply_assets(media.pk, rows)
        media.refresh_from_db()
        flags = completeness_flags(media)
        self.assertTrue(flags["has_logo"])
        self.assertTrue(flags["has_textless_poster"])
        self.assertTrue(flags["has_backdrop"])


class FanartEnrichImagesTests(TestCase):
    """Async driver: context resolution + Fanart fetch + sync asset apply.

    The two DB-backed helpers run through ``sync_to_async`` on a worker thread,
    where a ``TestCase`` transaction isn't visible, so they're stubbed to keep
    each branch deterministic; their real DB behavior is covered by the sync
    ``FanartContextTests``/``ApplyFanartAssetsTests`` classes above.
    """

    def setUp(self):
        self.media = _media()

    def _provider(self, raw=None):
        provider = mock.Mock()
        provider.get_movie_images = mock.AsyncMock(return_value=raw)
        provider.get_show_images = mock.AsyncMock(return_value=raw)
        return provider

    def _context(self):
        return {"kind": "movie", "lookup_id": TMDB_ID}

    def test_no_context_is_benign_noop(self):
        provider = self._provider(_movie_art())
        with mock.patch(
            "apps.media.services.fanart_ingest._context", return_value=None
        ):
            result = _run(fanart_enrich_images(self.media.pk, provider=provider))

        provider.get_movie_images.assert_not_called()
        provider.get_show_images.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no context")

    def test_movie_fetches_by_tmdb_id_and_applies_assets(self):
        provider = self._provider(_movie_art())
        with mock.patch(
            "apps.media.services.fanart_ingest._context",
            return_value=self._context(),
        ), mock.patch(
            "apps.media.services.fanart_ingest._apply_assets", return_value=4
        ) as apply:
            result = _run(fanart_enrich_images(self.media.pk, provider=provider))

        provider.get_movie_images.assert_awaited_once_with(TMDB_ID)
        provider.get_show_images.assert_not_called()
        apply.assert_called_once()
        self.assertEqual(result["kind"], "movie")
        self.assertEqual(result["assets"], 4)
        self.assertTrue(result["enriched"])
        self.assertIsNone(result["reason"])

    def test_show_fetches_by_tvdb_id(self):
        provider = self._provider(_show_art())
        context = {"kind": "show", "lookup_id": TVDB_ID}
        with mock.patch(
            "apps.media.services.fanart_ingest._context", return_value=context
        ), mock.patch(
            "apps.media.services.fanart_ingest._apply_assets", return_value=2
        ) as apply:
            result = _run(fanart_enrich_images(self.media.pk, provider=provider))

        provider.get_show_images.assert_awaited_once_with(TVDB_ID)
        provider.get_movie_images.assert_not_called()
        apply.assert_called_once()
        self.assertEqual(result["kind"], "show")
        self.assertTrue(result["enriched"])

    def test_provider_miss_is_benign_noop(self):
        provider = self._provider(None)
        with mock.patch(
            "apps.media.services.fanart_ingest._context",
            return_value=self._context(),
        ), mock.patch(
            "apps.media.services.fanart_ingest._apply_assets"
        ) as apply:
            result = _run(fanart_enrich_images(self.media.pk, provider=provider))

        provider.get_movie_images.assert_awaited_once()
        apply.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no result")

    def test_payload_without_tracked_artwork_is_benign_noop(self):
        provider = self._provider({"tvbanner": [_entry("https://a.fanart.tv/banner.png")]})
        with mock.patch(
            "apps.media.services.fanart_ingest._context",
            return_value=self._context(),
        ), mock.patch(
            "apps.media.services.fanart_ingest._apply_assets"
        ) as apply:
            result = _run(fanart_enrich_images(self.media.pk, provider=provider))

        apply.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no assets")


class FanartProviderTests(TestCase):
    """Client transport: key/param injection + path routing + miss normalization."""

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
        return FanartProvider(
            redis=FakeAsyncRedis(),
            http_client=httpx.AsyncClient(transport=transport, base_url=BASE_URL),
        )

    def test_movie_images_hit_tmdb_path_with_api_key(self):
        def handler(request):
            # BASE_URL already carries the /v3 prefix; httpx resolves the
            # provider's /movies/{id} path beneath it.
            self.assertEqual(request.url.path, "/v3/movies/550")
            self.assertEqual(request.url.params["api_key"], "test-key")
            return httpx.Response(200, json=_movie_art())

        with override_settings(FANART_API_KEY="test-key"):
            result = _run(self._client(handler).get_movie_images(TMDB_ID))

        self.assertIn("hdmovielogo", result)

    def test_show_images_hit_tvdb_path(self):
        def handler(request):
            self.assertEqual(request.url.path, "/v3/tv/73713")
            self.assertEqual(request.url.params["api_key"], "test-key")
            return httpx.Response(200, json=_show_art())

        with override_settings(FANART_API_KEY="test-key"):
            result = _run(self._client(handler).get_show_images(TVDB_ID))

        self.assertIn("hdtvlogo", result)

    def test_non_200_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(404, text="missing")

        with override_settings(FANART_API_KEY="test-key"):
            result = _run(self._client(handler).get_movie_images(TMDB_ID))

        self.assertIsNone(result)

    def test_non_dict_body_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(200, json=[1, 2, 3])

        with override_settings(FANART_API_KEY="test-key"):
            result = _run(self._client(handler).get_movie_images(TMDB_ID))

        self.assertIsNone(result)
