"""Tests for the LRCLIB album-track lyric enrich service (``apps.media.services.lrclib_ingest``).

DB-touching pieces run as sync ``TestCase`` against the real (test) database:
the pure ``_lyrics_text`` picker, ``_album_context``'s DB read (primary-artist
credit + which tracks still lack lyrics), and the idempotent ``_apply_lyrics``
write. The async driver (``lrclib_enrich_album``) runs its DB read/write via
``sync_to_async`` on a worker-thread connection that escapes ``TestCase``'s
per-test rollback, so its async tests stub ``_album_context``/``_apply_lyrics``
and assert call patterns instead. ``core.providers.lrclib.LRCLIBProvider`` is
exercised over an ``httpx.MockTransport`` (free/no-auth, so there is no api key;
the token bucket runs on an in-memory Redis double).
"""

from __future__ import annotations

import asyncio
from unittest import mock

import httpx
from django.test import TestCase

from apps.media.models import Album, MediaItem, Track
from apps.media.services.lrclib_ingest import (
    _album_context,
    _apply_lyrics,
    _lyrics_text,
    lrclib_enrich_album,
)
from apps.people.models import MediaCredit, Person
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.lrclib import BASE_URL, LRCLIBProvider


def _run(coro):
    return asyncio.run(coro)


def _media(**overrides):
    fields = dict(media_type="music", title="Kid A", slug="kid-a")
    fields.update(overrides)
    media = MediaItem.objects.create(**fields)
    Album.objects.create(media_item=media)
    return media


def _add_primary_artist(media, name="Radiohead"):
    person = Person.objects.create(name=name)
    return MediaCredit.objects.create(media_item=media, person=person, role="primary")


def _add_track(media, *, title, track_number, duration_ms=None, lyrics=None):
    return Track.objects.create(
        album_id=media.pk,
        disc_number=1,
        track_number=track_number,
        title=title,
        duration_ms=duration_ms,
        lyrics=lyrics,
    )


def _lyrics_payload(**overrides):
    payload = {"plainLyrics": "One two three", "syncedLyrics": None}
    payload.update(overrides)
    return payload


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


class LyricsTextTests(TestCase):
    def test_plain_lyrics_preferred_over_synced(self):
        payload = _lyrics_payload(syncedLyrics="[00:00.00] One two three")
        self.assertEqual(_lyrics_text(payload), "One two three")

    def test_synced_fallback_when_plain_blank(self):
        payload = _lyrics_payload(plainLyrics="   ", syncedLyrics="[00:00.00] Kid A")
        self.assertEqual(_lyrics_text(payload), "[00:00.00] Kid A")

    def test_none_when_neither_field_is_usable(self):
        self.assertIsNone(_lyrics_text({}))
        self.assertIsNone(_lyrics_text(None))
        self.assertIsNone(_lyrics_text({"plainLyrics": 5, "syncedLyrics": 5}))
        self.assertIsNone(_lyrics_text({"plainLyrics": "   ", "syncedLyrics": ""}))


class LrclibAlbumContextTests(TestCase):
    def test_none_without_a_primary_artist_credit(self):
        media = _media()
        _add_track(media, title="Kid A", track_number=1)
        self.assertIsNone(_album_context(media.pk))

    def test_resolves_artist_album_and_lyricless_tracks(self):
        media = _media()
        _add_primary_artist(media)
        track = _add_track(
            media, title="Everything in Its Right Place", track_number=1, duration_ms=253000
        )
        _add_track(media, title="Kid A", track_number=2, duration_ms=275000, lyrics="filled")
        context = _album_context(media.pk)
        self.assertEqual(context["artist"], "Radiohead")
        self.assertEqual(context["album"], "Kid A")
        self.assertEqual(context["tracks"], [(track.pk, "Everything in Its Right Place", 253000)])

    def test_all_tracks_lyricless_returns_full_list(self):
        media = _media()
        _add_primary_artist(media)
        track = _add_track(media, title="Kid A", track_number=1, duration_ms=None)
        context = _album_context(media.pk)
        self.assertEqual(context["tracks"], [(track.pk, "Kid A", None)])


class ApplyLyricsTests(TestCase):
    def test_writes_only_to_still_lyricless_tracks(self):
        media = _media()
        track = _add_track(media, title="Kid A", track_number=1)
        other = _add_track(media, title="Motion Picture Soundtrack", track_number=2)
        updated = _apply_lyrics([(track.pk, "Some text")])
        track.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(updated, 1)
        self.assertEqual(track.lyrics, "Some text")
        self.assertIsNone(other.lyrics)

    def test_track_that_gained_lyrics_since_read_is_skipped(self):
        media = _media()
        track = _add_track(media, title="Kid A", track_number=1, lyrics="already here")
        updated = _apply_lyrics([(track.pk, "new text")])
        track.refresh_from_db()
        self.assertEqual(updated, 0)
        self.assertEqual(track.lyrics, "already here")


class LrclibEnrichAlbumTests(TestCase):
    """Async driver: context resolution + per-track LRCLIB fetch + sync apply.

    The two DB-backed helpers run through ``sync_to_async`` on a worker thread,
    where a ``TestCase`` transaction isn't visible, so they're stubbed to keep
    each branch deterministic; their real DB behavior is covered by the sync
    ``LrclibAlbumContextTests``/``ApplyLyricsTests`` classes above.
    """

    def setUp(self):
        self.media = _media()
        self.track = _add_track(
            media=self.media,
            title="Everything in Its Right Place",
            track_number=1,
            duration_ms=253000,
        )

    def _context(self, tracks=None):
        return {
            "artist": "Radiohead",
            "album": "Kid A",
            "tracks": tracks
            if tracks is not None
            else [(self.track.pk, "Everything in Its Right Place", 253000)],
        }

    def _provider(self, by_title):
        provider = mock.Mock()

        async def _fake(track_name, artist_name, album_name, duration):
            return by_title.get(track_name)

        provider.get_lyrics = mock.AsyncMock(side_effect=_fake)
        return provider

    def test_no_context_is_benign_noop(self):
        provider = self._provider({})
        with mock.patch(
            "apps.media.services.lrclib_ingest._album_context", return_value=None
        ):
            result = _run(lrclib_enrich_album(self.media.pk, provider=provider))

        provider.get_lyrics.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no context")

    def test_no_tracks_is_benign_noop(self):
        provider = self._provider({})
        with mock.patch(
            "apps.media.services.lrclib_ingest._album_context",
            return_value=self._context(tracks=[]),
        ):
            result = _run(lrclib_enrich_album(self.media.pk, provider=provider))

        provider.get_lyrics.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no tracks")

    def test_fetches_plain_and_synced_and_applies_text(self):
        synced_track = _add_track(
            media=self.media, title="Kid A", track_number=2, duration_ms=275000
        )
        context = self._context(
            tracks=[
                (self.track.pk, "Everything in Its Right Place", 253000),
                (synced_track.pk, "Kid A", 275000),
            ]
        )
        provider = self._provider(
            {
                "Everything in Its Right Place": _lyrics_payload(),
                "Kid A": {
                    "plainLyrics": "",
                    "syncedLyrics": "[00:12.00] Kid A, Kid A",
                },
            }
        )
        with mock.patch(
            "apps.media.services.lrclib_ingest._album_context", return_value=context
        ), mock.patch(
            "apps.media.services.lrclib_ingest._apply_lyrics", return_value=2
        ) as apply:
            result = _run(lrclib_enrich_album(self.media.pk, provider=provider))

        self.assertEqual(
            provider.get_lyrics.await_args_list,
            [
                mock.call(
                    track_name="Everything in Its Right Place",
                    artist_name="Radiohead",
                    album_name="Kid A",
                    duration=253,
                ),
                mock.call(
                    track_name="Kid A",
                    artist_name="Radiohead",
                    album_name="Kid A",
                    duration=275,
                ),
            ],
        )
        apply.assert_called_once_with(
            [
                (self.track.pk, "One two three"),
                (synced_track.pk, "[00:12.00] Kid A, Kid A"),
            ]
        )
        self.assertTrue(result["enriched"])
        self.assertEqual(result["tracks"], 2)
        self.assertIsNone(result["reason"])

    def test_all_misses_are_benign_noop(self):
        provider = self._provider({})
        with mock.patch(
            "apps.media.services.lrclib_ingest._album_context",
            return_value=self._context(),
        ), mock.patch(
            "apps.media.services.lrclib_ingest._apply_lyrics"
        ) as apply:
            result = _run(lrclib_enrich_album(self.media.pk, provider=provider))

        apply.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no results")


class LRCLIBProviderTests(TestCase):
    """Client transport: lookup params + statusCode/non-200/no-lyrics miss -> None."""

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
        return LRCLIBProvider(
            redis=FakeAsyncRedis(),
            http_client=httpx.AsyncClient(transport=transport, base_url=BASE_URL),
        )

    def test_get_lyrics_sends_lookup_params_and_returns_payload(self):
        payload = _lyrics_payload()

        def handler(request):
            params = request.url.params
            self.assertEqual(params["track_name"], "Everything in Its Right Place")
            self.assertEqual(params["artist_name"], "Radiohead")
            self.assertEqual(params["album_name"], "Kid A")
            self.assertEqual(params["duration"], "253")
            return httpx.Response(200, json=payload)

        result = _run(
            self._client(handler).get_lyrics(
                "Everything in Its Right Place", "Radiohead", "Kid A", duration=253
            )
        )
        self.assertEqual(result["plainLyrics"], "One two three")

    def test_omits_optional_hints_when_absent(self):
        def handler(request):
            params = request.url.params
            self.assertEqual(params["track_name"], "Kid A")
            self.assertNotIn("album_name", params)
            self.assertNotIn("duration", params)
            return httpx.Response(200, json=_lyrics_payload())

        result = _run(self._client(handler).get_lyrics("Kid A", "Radiohead"))
        self.assertEqual(result["plainLyrics"], "One two three")

    def test_404_status_envelope_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(200, json={"statusCode": 404, "name": "Not found"})

        result = _run(self._client(handler).get_lyrics("Kid A", "Radiohead"))
        self.assertIsNone(result)

    def test_payload_without_lyric_fields_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(200, json={"id": 42, "instrumental": True})

        result = _run(self._client(handler).get_lyrics("Untitled", "Radiohead"))
        self.assertIsNone(result)

    def test_non_200_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(503, text="unavailable")

        result = _run(self._client(handler).get_lyrics("Kid A", "Radiohead"))
        self.assertIsNone(result)
