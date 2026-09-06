"""Tests the MusicBrainz release ingest service (increment 43).

Synchronous path is DB-touching like the tmdb seed tests: seeding a release
runs ``MediaItem`` (``media_type="music"``) + ``Album`` + ``Track`` writes on
the real test DB. The fetch path is exercised by stubbing
``seed_album_from_musicbrainz`` (its ORM write runs via ``sync_to_async`` on a
worker-thread connection that would escape ``TestCase`` rollback) and handing
``fetch_and_seed_album`` a provider double whose ``get_release`` returns the raw
payload — no network or broker touched.
"""

from __future__ import annotations

import asyncio
from unittest import mock

from django.test import TestCase

from apps.media.models import Album, ExternalID, MediaItem, Track
from apps.media.services.musicbrainz_ingest import (
    fetch_and_seed_album,
    seed_album_from_musicbrainz,
)


def _run(coro):
    return asyncio.run(coro)


def _release_raw(**overrides):
    raw = {
        "id": "2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f",
        "title": "In Rainbows",
        "disambiguation": "",
        "date": "2007-10-10",
        "barcode": "880882144322",
        "release-group": {"primary-type": "Album"},
        "label-info": [{"catalog-number": "XLCD 304"}],
        "media": [
            {
                "position": 1,
                "format": "CD",
                "track-count": 2,
                "tracks": [
                    {
                        "position": 1,
                        "number": "1",
                        "title": "15 Step",
                        "length": 237000,
                        "recording": {"id": "recording-aaa"},
                    },
                    {
                        "position": 2,
                        "number": "2",
                        "title": "Bodysnatchers",
                        "length": 241000,
                        "recording": {"id": "recording-bbb"},
                    },
                ],
            },
            {
                "position": 2,
                "format": "CD",
                "track-count": 1,
                "tracks": [
                    {
                        "position": 1,
                        "number": "1",
                        "title": "Jigsaw Falling Into Place",
                        "length": 259000,
                        "recording": {"id": "recording-ccc"},
                    }
                ],
            },
        ],
    }
    raw.update(overrides)
    return raw


class SeedAlbumFromMusicbrainzTests(TestCase):
    def test_creates_music_hub_album_subtype_and_tracks(self):
        media_id = seed_album_from_musicbrainz(_release_raw())
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.media_type, "music")
        self.assertEqual(media.title, "In Rainbows")
        self.assertEqual(str(media.release_date), "2007-10-10")
        self.assertEqual(media.completeness_score, 0.15)
        self.assertIsNotNone(media.next_sync_at)

        album = Album.objects.get(media_item_id=media_id)
        self.assertEqual(album.release_type, "album")
        self.assertEqual(album.format, "CD")
        self.assertEqual(album.catalog_number, "XLCD 304")
        self.assertEqual(album.barcode, "880882144322")
        self.assertEqual(album.track_count, 3)
        self.assertEqual(album.disc_count, 2)
        self.assertEqual(album.duration_ms, 737000)

        tracks = list(
            Track.objects.filter(album_id=media_id).order_by("disc_number", "track_number")
        )
        self.assertEqual(
            [(t.disc_number, t.track_number, t.title, t.duration_ms) for t in tracks],
            [
                (1, 1, "15 Step", 237000),
                (1, 2, "Bodysnatchers", 241000),
                (2, 1, "Jigsaw Falling Into Place", 259000),
            ],
        )
        # media hub carries the musicbrainz release id; each track its recording
        self.assertTrue(
            ExternalID.objects.filter(
                content_type__model="mediaitem",
                object_id=media_id,
                provider="musicbrainz",
                media_type="music",
                external_id="2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f",
            ).exists()
        )
        self.assertEqual(
            ExternalID.objects.filter(content_type__model="track", provider="musicbrainz").count(),
            3,
        )

    def test_reseed_refreshes_and_adds_tracks_only_once(self):
        media_id = seed_album_from_musicbrainz(_release_raw())
        seed_album_from_musicbrainz(_release_raw())
        self.assertEqual(MediaItem.objects.filter(media_type="music").count(), 1)
        self.assertEqual(Album.objects.count(), 1)
        self.assertEqual(Track.objects.filter(album_id=media_id).count(), 3)
        self.assertEqual(
            ExternalID.objects.filter(content_type__model="track", provider="musicbrainz").count(),
            3,
        )

        # a re-sync whose payload gains a 4th track on disc 2 upserts it
        grown = _release_raw()
        grown["media"][1]["tracks"].append(
            {
                "position": 2,
                "number": "2",
                "title": "House of Cards",
                "length": 329000,
                "recording": {"id": "recording-ddd"},
            }
        )
        seed_album_from_musicbrainz(grown)
        album = Album.objects.get(media_item_id=media_id)
        self.assertEqual(album.track_count, 4)
        self.assertEqual(album.duration_ms, 737000 + 329000)
        self.assertEqual(Track.objects.filter(album_id=media_id, disc_number=2).count(), 2)
        self.assertEqual(
            ExternalID.objects.filter(content_type__model="track", provider="musicbrainz").count(),
            4,
        )

    def test_same_title_different_mbid_are_separate_rows(self):
        # albums share titles, so seeding never falls back to a same-slug merge
        first = seed_album_from_musicbrainz(_release_raw())
        second = seed_album_from_musicbrainz(
            _release_raw(id="9c1f4f4e-7f2a-4a4a-8f1b-3b3b3b3b3b3b", title="In Rainbows")
        )
        self.assertNotEqual(first, second)
        self.assertEqual(MediaItem.objects.filter(media_type="music").count(), 2)
        self.assertEqual(
            ExternalID.objects.filter(
                content_type__model="mediaitem", provider="musicbrainz", media_type="music"
            ).count(),
            2,
        )

    def test_missing_release_id_raises_value_error(self):
        with self.assertRaises(ValueError):
            seed_album_from_musicbrainz({"title": "No id here"})


class FetchAndSeedAlbumTests(TestCase):
    def test_fetches_release_and_passes_raw_to_seed(self):
        raw = _release_raw()
        provider = mock.Mock()
        provider.get_release = mock.AsyncMock(return_value=raw)

        with mock.patch(
            "apps.media.services.musicbrainz_ingest.seed_album_from_musicbrainz",
            return_value=54321,
        ) as seed:
            result = _run(
                fetch_and_seed_album(
                    "2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f", provider=provider
                )
            )

        provider.get_release.assert_awaited_once_with(
            "2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f"
        )
        seed.assert_called_once_with(raw)
        self.assertEqual(result, 54321)
