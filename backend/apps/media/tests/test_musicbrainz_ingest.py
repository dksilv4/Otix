"""Tests the MusicBrainz release ingest service (increments 43 + 47).

Synchronous path is DB-touching like the tmdb seed tests: seeding a release
runs ``MediaItem`` (``media_type="music"``) + ``Album`` + ``Track`` writes on
the real test DB, and since increment 47 the full-hydration tail (artist →
Person/MediaCredit, label → Company/InvolvedCompany, genres, url-rel ids and
cover-art assets) is folded into the same seed. The fetch path is exercised by
stubbing ``seed_album_from_musicbrainz`` (its ORM write runs via
``sync_to_async`` on a worker-thread connection that would escape ``TestCase``
rollback) and handing ``fetch_and_seed_album`` a provider double whose
``get_release``/``get_cover_art`` return the payloads — no network or broker
touched.
"""

from __future__ import annotations

import asyncio
from unittest import mock

from django.test import TestCase, override_settings

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    Album,
    ExternalID,
    MediaAsset,
    MediaItem,
    Track,
)
from apps.media.models.genre import Genre, MediaGenre
from apps.media.services.musicbrainz_ingest import (
    attach_album_cover,
    fetch_and_seed_album,
    seed_album_from_musicbrainz,
)
from apps.people.models import MediaCredit, Person


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


def _hydrated_raw(**overrides):
    """A release whose detail carries the full-hydration tail inputs."""
    raw = _release_raw(
        id="a3c0d8f4-1b2e-4a3c-8d5e-6f7a8b9c0d1e",
        title="OK Computer",
    )
    raw["artist-credit"] = [
        {
            "artist": {"id": "artist-radiohead", "name": "Radiohead"},
            "joinphrase": "",
        }
    ]
    raw["label-info"] = [
        {"label": {"name": "XL Recordings"}, "catalog-number": "XLCD 304"},
        {"catalog-number": "XLCD 304"},
    ]
    raw["genres"] = [
        {"name": "Art Rock"},
        {"name": "Alternative Rock"},
        {"name": "Noise"},
        {"name": "Piano Rock"},
        {"name": "Psychedelic Rock"},
        {"name": "Sadcore"},
        {"name": "Shoegaze"},
        {"name": "Surf Rock"},
        {"name": "Experimental Rock"},
    ]
    raw["relations"] = [
        {
            "type": "streaming",
            "url": {"resource": "https://deezer.com/album/123456"},
        },
        {
            "type": "streaming",
            "url": {"resource": "https://music.apple.com/us/album/ok-computer/2849384"},
        },
        {"type": "lyrics", "url": {"resource": "https://example.com/not-a-provider"}},
    ]
    raw.update(overrides)
    return raw


class SeedAlbumFromMusicbrainzTests(TestCase):
    def test_creates_music_hub_album_subtype_and_tracks(self):
        media_id = seed_album_from_musicbrainz(_release_raw())
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.media_type, "music")
        self.assertEqual(media.title, "In Rainbows")
        self.assertEqual(str(media.release_date), "2007-10-10")
        # Recompute at the seed tail: 2/17 music flags (no cover in the plain seed).
        self.assertEqual(media.completeness_score, 0.125)
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

    def test_artist_shared_across_releases_reuses_one_person(self):
        first = seed_album_from_musicbrainz(_hydrated_raw())
        second = seed_album_from_musicbrainz(
            _hydrated_raw(
                id="4b5f0a9c-77fd-4b6e-8b6e-0a0a0a0a0a0a",
                title="Kid A",
                **{
                    "artist-credit": [
                        {
                            "artist": {"id": "artist-radiohead", "name": "Radiohead"},
                            "joinphrase": "",
                        }
                    ]
                },
            )
        )

        self.assertNotEqual(first, second)
        self.assertEqual(Person.objects.count(), 1)
        self.assertEqual(MediaCredit.objects.filter(media_item_id=first).count(), 1)
        self.assertEqual(MediaCredit.objects.filter(media_item_id=second).count(), 1)
        person = Person.objects.get()
        self.assertEqual(
            ExternalID.objects.filter(
                content_type__model="person",
                provider="musicbrainz_artist",
                object_id=person.pk,
            ).count(),
            1,
        )

    def test_artist_name_backfill_avoids_duplicate_person(self):
        # A pre-existing Person with no musicbrainz_artist id (e.g. seeded by
        # another provider) is backfilled rather than duplicated.
        existing = Person.objects.create(name="Radiohead")
        media_id = seed_album_from_musicbrainz(_hydrated_raw())

        self.assertEqual(Person.objects.count(), 1)
        self.assertEqual(Person.objects.get(pk=existing.pk).pk, existing.pk)
        self.assertTrue(
            ExternalID.objects.filter(
                content_type__model="person",
                provider="musicbrainz_artist",
                object_id=existing.pk,
                external_id="artist-radiohead",
            ).exists()
        )
        self.assertEqual(MediaCredit.objects.filter(media_item_id=media_id).count(), 1)

    def test_seed_hydrates_artists_labels_genres_and_url_ids(self):
        media_id = seed_album_from_musicbrainz(_hydrated_raw())
        media = MediaItem.objects.get(pk=media_id)

        # Artist credit -> Person + MediaCredit (primary, joinphrase folded).
        credit = MediaCredit.objects.get(media_item=media)
        self.assertEqual(credit.person.name, "Radiohead")
        self.assertEqual(credit.role, "primary")
        self.assertEqual(credit.sort_order, 0)
        self.assertEqual(credit.character_name, "Radiohead")
        self.assertEqual(Person.objects.count(), 1)
        self.assertTrue(
            ExternalID.objects.filter(
                content_type__model="person",
                provider="musicbrainz_artist",
                external_id="artist-radiohead",
            ).exists()
        )

        # Record label -> Company + publisher InvolvedCompany.
        company = Company.objects.get()
        self.assertEqual(company.name, "XL Recordings")
        self.assertEqual(company.slug, "xl-recordings")
        involved = InvolvedCompany.objects.get(media_item=media)
        self.assertEqual(involved.company_id, company.pk)
        self.assertTrue(involved.publisher)

        # Genres capped at the legacy first 8 (the 9th name is dropped).
        self.assertEqual(MediaGenre.objects.filter(media_item=media).count(), 8)
        self.assertEqual(Genre.objects.count(), 8)
        self.assertFalse(Genre.objects.filter(name="Experimental Rock").exists())

        # url-rels -> media ExternalIDs (unknown providers dropped).
        pairs = {
            ext.provider: ext.external_id
            for ext in ExternalID.objects.filter(
                content_type__model="mediaitem",
                provider__in=["deezer", "apple_music"],
                media_type="music",
            )
        }
        self.assertEqual(pairs, {"deezer": "123456", "apple_music": "2849384"})
        self.assertFalse(ExternalID.objects.filter(provider="example").exists())

    def test_reseed_does_not_duplicate_hydrated_rows(self):
        seed_album_from_musicbrainz(_hydrated_raw())
        media_id = seed_album_from_musicbrainz(_hydrated_raw())

        self.assertEqual(Person.objects.count(), 1)
        self.assertEqual(MediaCredit.objects.filter(media_item_id=media_id).count(), 1)
        self.assertEqual(Company.objects.count(), 1)
        self.assertEqual(InvolvedCompany.objects.filter(media_item_id=media_id).count(), 1)
        self.assertEqual(MediaGenre.objects.filter(media_item_id=media_id).count(), 8)
        self.assertEqual(
            ExternalID.objects.filter(
                content_type__model="mediaitem", provider="deezer", media_type="music"
            ).count(),
            1,
        )


class AttachAlbumCoverTests(TestCase):
    def _media(self):
        return MediaItem.objects.create(media_type="music", title="OK Computer", slug="ok-computer")

    def test_front_and_back_images_become_poster_and_backdrop(self):
        media = self._media()
        images = [
            {
                "front": True,
                "image": "https://coverartarchive.org/front.jpg",
                "thumbnails": {"large": "https://coverartarchive.org/front-large.jpg"},
            },
            {
                "back": True,
                "image": "https://coverartarchive.org/back.jpg",
            },
            {"image": "https://coverartarchive.org/disc.jpg"},  # neither front/back
        ]
        added = attach_album_cover(media.pk, images)

        self.assertEqual(added, 2)
        poster = MediaAsset.objects.get(media_item=media, asset_type="poster")
        self.assertEqual(poster.url, "https://coverartarchive.org/front-large.jpg")
        self.assertEqual(poster.provider, "musicbrainz")
        self.assertEqual(poster.label, "album_cover")
        backdrop = MediaAsset.objects.get(media_item=media, asset_type="backdrop")
        self.assertEqual(backdrop.url, "https://coverartarchive.org/back.jpg")
        self.assertIsNone(backdrop.label)

    def test_attach_is_idempotent_and_skips_untyped(self):
        media = self._media()
        images = [{"front": True, "image": "https://coverartarchive.org/front.jpg"}]
        attach_album_cover(media.pk, images)
        added = attach_album_cover(media.pk, images)

        self.assertEqual(added, 0)
        self.assertEqual(MediaAsset.objects.filter(media_item=media).count(), 1)


class FetchAndSeedAlbumTests(TestCase):
    def test_fetches_release_and_passes_raw_to_seed(self):
        raw = _release_raw()
        provider = mock.Mock()
        provider.get_release = mock.AsyncMock(return_value=raw)
        provider.get_cover_art = mock.AsyncMock(return_value=None)

        with mock.patch(
            "apps.media.services.musicbrainz_ingest.seed_album_from_musicbrainz",
            return_value=54321,
        ) as seed:
            result = _run(
                fetch_and_seed_album("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f", provider=provider)
            )

        provider.get_release.assert_awaited_once_with("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f")
        provider.get_cover_art.assert_awaited_once_with("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f")
        seed.assert_called_once_with(raw)
        self.assertEqual(result, 54321)

    def test_cover_art_is_attached_after_seed(self):
        raw = _release_raw()
        images = [{"front": True, "image": "https://coverartarchive.org/front.jpg"}]
        provider = mock.Mock()
        provider.get_release = mock.AsyncMock(return_value=raw)
        provider.get_cover_art = mock.AsyncMock(return_value={"images": images})

        with (
            mock.patch(
                "apps.media.services.musicbrainz_ingest.seed_album_from_musicbrainz",
                return_value=54321,
            ) as seed,
            mock.patch(
                "apps.media.services.musicbrainz_ingest.attach_album_cover",
                return_value=1,
            ) as attach,
        ):
            result = _run(
                fetch_and_seed_album("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f", provider=provider)
            )

        seed.assert_called_once_with(raw)
        attach.assert_called_once_with(54321, images)
        self.assertEqual(result, 54321)


class LastfmEnrichFoldInTests(TestCase):
    """The album fetch tail folds in Last.fm enrichment (key-gated).

    The seed/cover writes are stubbed (a real write crosses ``sync_to_async``
    onto a worker thread a ``TestCase`` can't see) and the Last.fm enrich driver
    is patched at its imported home in ``musicbrainz_ingest``; these tests assert
    the gate + call wiring, not the Last.fm mapping (covered by
    ``test_lastfm_ingest.py``).
    """

    def test_album_tail_enriches_when_key_configured(self):
        provider = mock.Mock()
        provider.get_release = mock.AsyncMock(return_value=_release_raw())
        provider.get_cover_art = mock.AsyncMock(return_value=None)
        with (
            override_settings(LASTFM_API_KEY="test-key"),
            mock.patch(
                "apps.media.services.musicbrainz_ingest.seed_album_from_musicbrainz",
                return_value=54321,
            ),
            mock.patch(
                "apps.media.services.musicbrainz_ingest.lastfm_enrich_album",
                new_callable=mock.AsyncMock,
            ) as enrich,
        ):
            result = _run(
                fetch_and_seed_album("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f", provider=provider)
            )

        self.assertEqual(result, 54321)
        enrich.assert_awaited_once_with(54321)

    def test_unconfigured_key_skips_enrich(self):
        provider = mock.Mock()
        provider.get_release = mock.AsyncMock(return_value=_release_raw())
        provider.get_cover_art = mock.AsyncMock(return_value=None)

        async def _boom(media_id):
            raise AssertionError("Last.fm enrich ran with no key configured")

        with (
            mock.patch(
                "apps.media.services.musicbrainz_ingest.seed_album_from_musicbrainz",
                return_value=54321,
            ),
            mock.patch(
                "apps.media.services.musicbrainz_ingest.lastfm_enrich_album",
                new=mock.AsyncMock(side_effect=_boom),
            ) as enrich,
        ):
            result = _run(
                fetch_and_seed_album("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f", provider=provider)
            )

        self.assertEqual(result, 54321)
        enrich.assert_not_awaited()


class LrclibEnrichFoldInTests(TestCase):
    """The album fetch tail folds in LRCLIB lyric enrichment (ungated).

    LRCLIB is free + no-auth, so unlike the Last.fm stage there is no key gate —
    the fold runs on every album seed and the driver self-limits (no primary
    artist or no lyrics-missing tracks is a benign no-op). The seed writes are
    stubbed (a real write crosses ``sync_to_async`` onto a worker thread a
    ``TestCase`` can't see) and the enrich driver is patched at its imported
    home in ``musicbrainz_ingest``.
    """

    def test_album_tail_enriches(self):
        provider = mock.Mock()
        provider.get_release = mock.AsyncMock(return_value=_release_raw())
        provider.get_cover_art = mock.AsyncMock(return_value=None)
        with (
            mock.patch(
                "apps.media.services.musicbrainz_ingest.seed_album_from_musicbrainz",
                return_value=54321,
            ),
            mock.patch(
                "apps.media.services.musicbrainz_ingest.lrclib_enrich_album",
                new_callable=mock.AsyncMock,
            ) as enrich,
        ):
            result = _run(
                fetch_and_seed_album("2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f", provider=provider)
            )

        self.assertEqual(result, 54321)
        enrich.assert_awaited_once_with(54321)
