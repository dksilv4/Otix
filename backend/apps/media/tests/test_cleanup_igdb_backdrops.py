"""Tests for the ``cleanup_igdb_backdrops`` management command.

Runs against real seeded game rows on the test DB; the command's network image
dimension fetch is patched so no external request is made.
"""

from __future__ import annotations

import unittest.mock as mock

from django.core.management import call_command
from django.test import TestCase

from apps.media.management.commands.cleanup_igdb_backdrops import _probe_dims
from apps.media.models import MediaAsset
from apps.media.services.igdb_ingest import seed_game_from_igdb

IGDB_ID = 550

_URL = "https://images.igdb.com/igdb/image/upload/t_original/{}.jpg"


def _game_raw(**overrides):
    raw = {
        "id": IGDB_ID,
        "name": "Forza Horizon 5",
        "slug": "forza-horizon-5",
        "cover": {"image_id": "co00"},
        "first_release_date": 1631750400,
    }
    raw.update(overrides)
    return raw


def _backdrop(media_item_id: int, image_id: str, **fields) -> MediaAsset:
    return MediaAsset.objects.create(
        media_item_id=media_item_id,
        asset_type="backdrop",
        provider="igdb",
        url=_URL.format(image_id),
        score=90,
        **fields,
    )


def _fake_dims(image_id: str) -> tuple[int, int]:
    """Per-image_id dims mirroring the real ar4tba.jpg logo-card bug."""
    return {"wide01": (3840, 2160), "logo01": (1200, 984)}[image_id]


class CleanupIgdbBackdropsTests(TestCase):
    def _seed(self) -> int:
        return seed_game_from_igdb(_game_raw(), IGDB_ID)

    def test_deletes_logo_cards_and_backfills_kept_dims(self):
        media_id = self._seed()
        _backdrop(media_id, "logo01")  # aspect 1.22 < 1.4 -> delete
        wide = _backdrop(media_id, "wide01")  # aspect 1.78 -> keep, dims backfilled

        with mock.patch(
            "apps.media.management.commands.cleanup_igdb_backdrops._image_dims",
            side_effect=lambda url: _fake_dims(url.rsplit("/", 1)[-1].split(".", 1)[0]),
        ):
            call_command("cleanup_igdb_backdrops")

        remaining = list(MediaAsset.objects.filter(media_item_id=media_id, asset_type="backdrop"))
        self.assertEqual(remaining, [MediaAsset.objects.get(pk=wide.pk)])
        wide.refresh_from_db()
        self.assertEqual((wide.width, wide.height), (3840, 2160))

    def test_rows_with_stored_dims_skip_the_network_fetch(self):
        media_id = self._seed()
        _backdrop(media_id, "keep01", width=4000, height=2500)  # aspect 1.6 -> keep
        _backdrop(media_id, "bad01", width=500, height=400)  # aspect 1.25 -> delete

        with mock.patch(
            "apps.media.management.commands.cleanup_igdb_backdrops._image_dims",
            side_effect=AssertionError("stored dims should avoid a fetch"),
        ):
            call_command("cleanup_igdb_backdrops")

        self.assertEqual(
            list(MediaAsset.objects.filter(media_item_id=media_id, asset_type="backdrop")),
            list(MediaAsset.objects.filter(media_item_id=media_id, url=_URL.format("keep01"))),
        )

    def test_dry_run_leaves_rows_untouched(self):
        media_id = self._seed()
        _backdrop(media_id, "logo01")

        with mock.patch(
            "apps.media.management.commands.cleanup_igdb_backdrops._image_dims",
            side_effect=lambda url: _fake_dims(url.rsplit("/", 1)[-1].split(".", 1)[0]),
        ):
            call_command("cleanup_igdb_backdrops", "--dry-run")

        self.assertEqual(
            MediaAsset.objects.filter(media_item_id=media_id, asset_type="backdrop").count(), 1
        )

    def test_unknown_dims_are_skipped_not_deleted(self):
        media_id = self._seed()
        _backdrop(media_id, "unreadable01")

        with mock.patch(
            "apps.media.management.commands.cleanup_igdb_backdrops._image_dims",
            return_value=None,
        ):
            call_command("cleanup_igdb_backdrops")

        self.assertEqual(
            MediaAsset.objects.filter(media_item_id=media_id, asset_type="backdrop").count(), 1
        )

    def test_reclassifies_wide_logo_banners_to_logo(self):
        media_id = self._seed()
        logo = _backdrop(media_id, "logo_banner", width=500, height=91)
        call_command("cleanup_igdb_backdrops")
        logo.refresh_from_db()
        self.assertEqual(logo.asset_type, "logo")
        self.assertEqual(logo.label, "official")

    def test_reclassifies_alpha_images_to_logo_and_icon(self):
        media_id = self._seed()
        logo = _backdrop(media_id, "alpha_logo", width=1920, height=800)
        icon = _backdrop(media_id, "alpha_icon", width=128, height=128)

        def mock_alpha(url: str) -> bool:
            return "alpha_" in url

        with mock.patch(
            "apps.media.management.commands.cleanup_igdb_backdrops._image_alpha",
            side_effect=mock_alpha,
        ):
            call_command("cleanup_igdb_backdrops")

        logo.refresh_from_db()
        icon.refresh_from_db()
        self.assertEqual(logo.asset_type, "logo")
        self.assertEqual(icon.asset_type, "icon")


class ImageDimsParsingTests(TestCase):
    """Header-parser unit tests (no network)."""

    def test_webp_vp8x(self):
        # A native-WebP IGDB upload (like ar4tba.jpg): RIFF/WEBP/VP8X header.
        buf = bytearray(30)
        buf[0:4] = b"RIFF"
        buf[8:12] = b"WEBP"
        buf[12:16] = b"VP8X"
        w, h = 1200, 984
        buf[24:27] = (w - 1).to_bytes(3, "little")
        buf[27:30] = (h - 1).to_bytes(3, "little")
        self.assertEqual(_probe_dims(bytes(buf)), (w, h))

    def test_webp_vp8l(self):
        buf = bytearray(30)
        buf[0:4] = b"RIFF"
        buf[8:12] = b"WEBP"
        buf[12:16] = b"VP8L"
        buf[20] = 0x2F
        w, h = 1200, 984
        packed = (w - 1) | ((h - 1) << 14)
        buf[21:25] = packed.to_bytes(4, "little")
        self.assertEqual(_probe_dims(bytes(buf)), (w, h))

    def test_png(self):
        buf = bytearray(b"\x89PNG\r\n\x1a\n")
        buf += (13).to_bytes(4, "big") + b"IHDR"
        buf += (3840).to_bytes(4, "big") + (2160).to_bytes(4, "big")
        self.assertEqual(_probe_dims(bytes(buf)), (3840, 2160))

    def test_jpeg(self):
        # SOI + SOF0: precision(8) height(0x0870=2160) width(0x0F00=3840).
        header = (
            b"\xff\xd8\xff\xc0\x00\x11\x08"
            b"\x08\x70"  # height 2160
            b"\x0f\x00"  # width 3840
            b"\x03" + bytes(15)
        )
        self.assertEqual(_probe_dims(header), (3840, 2160))

    def test_short_buffer_returns_none(self):
        self.assertIsNone(_probe_dims(b"\x89PNG\r\n\x1a\n"))  # dims not yet present
        self.assertIsNone(_probe_dims(b""))

    def test_probe_alpha_png(self):
        from apps.media.management.commands.cleanup_igdb_backdrops import _probe_alpha

        # PNG color_type 6 = RGBA
        rgba_png = bytearray(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x06\x00\x00\x00")
        self.assertTrue(_probe_alpha(bytes(rgba_png)))

        # PNG color_type 2 = RGB (no alpha)
        rgb_png = bytearray(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x02\x00\x00\x00")
        self.assertFalse(_probe_alpha(bytes(rgb_png)))
