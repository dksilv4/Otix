"""Tests for local artwork mirroring (download / serve / storage).

Covers ``apps.media.services.assets`` (``download_asset`` and
``download_primary_assets``) against a mocked httpx transport writing into an
overridden ``MEDIA_DIR``, the public ``/api/v1/assets/<name>`` file view, the
``_pick_asset`` local-URL switch in ``catalog``, and the staff-only admin
download + storage endpoints.
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import mock

import httpx
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaAsset, MediaItem, MediaServerSetting
from apps.media.services.assets import (
    MIN_FREE_GB_KEY,
    SWEEP_LAST_RUN_KEY,
    asset_dir,
    discover_enabled,
    disk_safe,
    download_asset,
    download_primary_assets,
    enabled_asset_types,
    fetch_enabled,
    local_games_enabled,
    min_free_gb,
    mirror_local_game_artwork,
    mirror_media_artwork,
    mirroring_enabled,
    record_sweep_run,
    set_asset_types,
    set_discover_enabled,
    set_fetch_enabled,
    set_local_games_enabled,
    set_min_free_gb,
    set_mirroring_enabled,
    set_sweep_interval_minutes,
    should_run_sweep,
    sweep_interval_minutes,
    sweep_limit,
    sweep_unmirrored_media,
)
from apps.media.services.catalog import _best_asset, _pick_asset

User = get_user_model()

PNG = b"\x89PNG\r\n\x1a\n" + bytes(range(64))  # arbitrary image body


class _FakeResponse:
    def __init__(
        self,
        content: bytes,
        status_code: int = 200,
        content_type: str = "image/png",
    ):
        self.content = content
        self.status_code = status_code
        self.headers = {"content-type": content_type}


class _FakeClient:
    def __init__(self, response: _FakeResponse | None = None):
        self._response = response

    def __enter__(self) -> _FakeClient:
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def get(self, url: str):
        self.requested_url = url
        return self._response


def _patch_http(response: _FakeResponse) -> mock.patch:
    return mock.patch("httpx.Client", return_value=_FakeClient(response))


class AssetTestCase(TestCase):
    """Shared fixtures: a temp ``MEDIA_DIR`` plus authenticated clients."""

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls._media_tmp = tempfile.TemporaryDirectory()
        cls._media_override = override_settings(MEDIA_DIR=cls._media_tmp.name)
        cls._media_override.enable()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._media_override.disable()
        cls._media_tmp.cleanup()
        super().tearDownClass()

    def setUp(self) -> None:
        media_root = Path(self._media_tmp.name)
        for child in media_root.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()

        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.token = Token.objects.create(user=self.user)
        self.staff = User.objects.create_user(
            username="mod", password="a-strong-pass", is_staff=True
        )
        self.staff_token = Token.objects.create(user=self.staff)

        self.client = APIClient()  # anonymous
        self.user_client = APIClient()
        self.user_client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.staff_client = APIClient()
        self.staff_client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

        self.item = MediaItem.objects.create(
            media_type="movie", title="Dune", slug="dune-assets"
        )

        # Keep the disk safety cap out of play for the shared fixtures; disk-cap
        # enforcement is exercised explicitly in DiskCapTests below.
        set_min_free_gb(0)

    def add_asset(
        self,
        *,
        asset_type: str = "poster",
        url: str = "http://img.example/dune.png",
        score: int = 50,
        local_name: str | None = None,
    ) -> MediaAsset:
        return MediaAsset.objects.create(
            media_item=self.item,
            asset_type=asset_type,
            url=url,
            score=score,
            local_name=local_name,
        )


class DownloadAssetTests(AssetTestCase):
    def test_writes_file_and_records_fields(self) -> None:
        asset = self.add_asset()
        with _patch_http(_FakeResponse(PNG)):
            written = download_asset(asset)

        self.assertEqual(written, len(PNG))
        asset.refresh_from_db()
        self.assertTrue(asset.local_name)
        self.assertTrue(asset.local_name.endswith(".png"))
        self.assertEqual(asset.local_size, len(PNG))
        self.assertIsNotNone(asset.downloaded_at)
        self.assertTrue((asset_dir() / asset.local_name).is_file())
        self.assertEqual((asset_dir() / asset.local_name).read_bytes(), PNG)

    def test_download_is_idempotent(self) -> None:
        (asset_dir() / "existing.png").write_bytes(PNG)
        asset = self.add_asset(local_name="existing.png")
        asset.local_size = len(PNG)
        asset.save(update_fields=["local_size"])

        with mock.patch("httpx.Client") as client:
            written = download_asset(asset)

        self.assertEqual(written, len(PNG))
        client.assert_not_called()
        self.assertEqual(
            {p.name for p in asset_dir().iterdir()}, {"existing.png"}
        )

    def test_non_2xx_leaves_fields_null(self) -> None:
        asset = self.add_asset()
        with _patch_http(_FakeResponse(b"", status_code=404)):
            written = download_asset(asset)

        self.assertIsNone(written)
        asset.refresh_from_db()
        self.assertIsNone(asset.local_name)
        self.assertIsNone(asset.local_size)
        self.assertIsNone(asset.downloaded_at)

    def test_transport_error_leaves_fields_null(self) -> None:
        asset = self.add_asset()
        with mock.patch("httpx.Client", side_effect=httpx.HTTPError("boom")):
            written = download_asset(asset)

        self.assertIsNone(written)
        asset.refresh_from_db()
        self.assertIsNone(asset.local_name)

    def test_download_primary_assets_reports_single_type(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        with _patch_http(_FakeResponse(PNG)):
            report = download_primary_assets(self.item)

        self.assertEqual(report["downloaded"], 1)
        self.assertEqual(report["types"], ["poster"])
        self.assertEqual(report["bytes"], len(PNG))
        self.assertEqual(report["media_item_id"], self.item.pk)

    def test_download_primary_skips_missing_types(self) -> None:
        self.add_asset(asset_type="logo")
        with _patch_http(_FakeResponse(PNG)):
            report = download_primary_assets(self.item)
        self.assertEqual(report["downloaded"], 1)
        self.assertEqual(report["types"], ["logo"])


class AssetFileViewTests(AssetTestCase):
    def _write(self, name: str, content: bytes = PNG) -> Path:
        path = asset_dir() / name
        path.write_bytes(content)
        return path

    def test_serves_local_file(self) -> None:
        self._write("serve-test.png", PNG)
        response = self.client.get("/api/v1/assets/serve-test.png")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertEqual(b"".join(response.streaming_content), PNG)

    def test_missing_file_404(self) -> None:
        response = self.client.get("/api/v1/assets/does-not-exist.png")
        self.assertEqual(response.status_code, 404)

    def test_path_traversal_rejected(self) -> None:
        self._write("secret.png")
        for name in ("..", "..%2Fsecret.png", "%2e%2e"):
            response = self.client.get(f"/api/v1/assets/{name}")
            self.assertEqual(response.status_code, 404, name)


class CatalogLocalUrlTests(AssetTestCase):
    def test_remote_url_used_before_download(self) -> None:
        asset = self.add_asset(url="http://img.example/poster.png")
        self.assertEqual(_best_asset(self.item, "poster"), asset)
        self.assertEqual(_pick_asset(self.item, "poster"), "http://img.example/poster.png")

    def test_local_url_used_once_downloaded(self) -> None:
        self.add_asset(local_name="abc123.png")
        self.assertEqual(_pick_asset(self.item, "poster"), "/api/v1/assets/abc123.png")

    def test_unknown_type_is_none(self) -> None:
        self.add_asset()
        self.assertIsNone(_pick_asset(self.item, "backdrop"))


class AdminAssetEndpointTests(AssetTestCase):
    def test_download_endpoint_staff_only(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        url = f"/api/v1/media/admin/media-items/{self.item.pk}/download-assets"
        with _patch_http(_FakeResponse(PNG)):
            response = self.staff_client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["downloaded"], 1)

        self.assertEqual(self.user_client.post(url).status_code, 403)  # authed, not staff
        self.assertEqual(self.client.post(url).status_code, 401)  # anonymous

    def test_download_endpoint_missing_item_404(self) -> None:
        response = self.staff_client.post(
            "/api/v1/media/admin/media-items/999999/download-assets"
        )
        self.assertEqual(response.status_code, 404)

    def test_storage_staff_only(self) -> None:
        MediaAsset.objects.create(
            media_item=self.item,
            asset_type="poster",
            url="http://img.example/poster.png",
            local_name="abc123.png",
            local_size=12345,
        )
        response = self.staff_client.get("/api/v1/media/admin/storage")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["downloaded_count"], 1)
        self.assertEqual(response.data["downloaded_bytes"], 12345)
        disk = response.data["disk"]
        self.assertGreater(disk["total"], 0)
        self.assertLessEqual(disk["free"], disk["total"])
        self.assertLessEqual(disk["used"], disk["total"])

        self.assertEqual(self.user_client.get("/api/v1/media/admin/storage").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/media/admin/storage").status_code, 401)

    def test_storage_reports_zero_when_nothing_downloaded(self) -> None:
        response = self.staff_client.get("/api/v1/media/admin/storage")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["downloaded_count"], 0)
        self.assertEqual(response.data["downloaded_bytes"], 0)
        self.assertTrue(response.data["disk"]["free"] > 0)


class MirroringToggleTests(AssetTestCase):
    def _mirror(self) -> str:
        return "/api/v1/media/admin/mirroring"

    def test_defaults_to_enabled(self) -> None:
        self.assertTrue(mirroring_enabled())
        response = self.staff_client.get(self._mirror())
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["enabled"], True)

    def test_toggle_disables_downloads_until_reenabled(self) -> None:
        self.add_asset(url="http://img.example/poster.png")

        response = self.staff_client.put(self._mirror(), {"enabled": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["enabled"], False)
        self.assertFalse(mirroring_enabled())

        blocked = self.staff_client.post(
            f"/api/v1/media/admin/media-items/{self.item.pk}/download-assets"
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertIn("mirroring is disabled", blocked.data["detail"].lower())

        response = self.staff_client.put(self._mirror(), {"enabled": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(mirroring_enabled())
        with _patch_http(_FakeResponse(PNG)):
            ok = self.staff_client.post(
                f"/api/v1/media/admin/media-items/{self.item.pk}/download-assets"
            )
        self.assertEqual(ok.status_code, 200)

    def test_put_rejects_non_boolean(self) -> None:
        response = self.staff_client.put(self._mirror(), {"enabled": "yes"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(mirroring_enabled())  # unchanged

    def test_staff_gating(self) -> None:
        self.assertEqual(self.client.get(self._mirror()).status_code, 401)
        self.assertEqual(self.user_client.get(self._mirror()).status_code, 403)
        self.assertEqual(self.user_client.put(self._mirror(), {"enabled": False}).status_code, 403)
        self.assertEqual(self.client.delete("/api/v1/media/admin/assets").status_code, 401)
        self.assertEqual(self.user_client.delete("/api/v1/media/admin/assets").status_code, 403)


class PurgeAssetsTests(AssetTestCase):
    def _create_local(self, name: str = "purge-me.png") -> MediaAsset:
        (asset_dir() / name).write_bytes(PNG)
        return MediaAsset.objects.create(
            media_item=self.item,
            asset_type="poster",
            url="http://remote.example/poster.png",
            score=50,
            local_name=name,
            local_size=len(PNG),
            downloaded_at=timezone.now(),
        )

    def test_purge_deletes_files_and_clears_fields(self) -> None:
        asset = self._create_local()
        self.assertTrue((asset_dir() / "purge-me.png").is_file())

        response = self.staff_client.delete("/api/v1/media/admin/assets")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["deleted"], 1)
        self.assertEqual(response.data["bytes_freed"], len(PNG))

        self.assertFalse((asset_dir() / "purge-me.png").exists())
        asset.refresh_from_db()
        self.assertIsNone(asset.local_name)
        self.assertIsNone(asset.local_size)
        self.assertIsNone(asset.downloaded_at)

        storage = self.staff_client.get("/api/v1/media/admin/storage").data
        self.assertEqual(storage["downloaded_count"], 0)
        self.assertEqual(storage["downloaded_bytes"], 0)
        # catalog falls back to the remote URL once local copy is gone
        self.assertEqual(_pick_asset(self.item, "poster"), "http://remote.example/poster.png")

    def test_purge_is_noop_when_nothing_downloaded(self) -> None:
        response = self.staff_client.delete("/api/v1/media/admin/assets")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["deleted"], 0)
        self.assertEqual(response.data["bytes_freed"], 0)


class PrimaryReconcileTests(AssetTestCase):
    """``download_primary_assets`` keeps exactly one mirrored copy per type."""

    def _logo(
        self,
        url: str,
        score: int,
        *,
        local_name: str | None = None,
    ) -> MediaAsset:
        return MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url=url,
            score=score,
            local_name=local_name,
            local_size=len(PNG) if local_name else None,
            downloaded_at=timezone.now() if local_name else None,
        )

    def test_discards_stale_copy_when_a_higher_scored_asset_becomes_best(self) -> None:
        stale = self._logo(
            "http://img.example/old.png", score=80, local_name="old-logo.png"
        )
        (asset_dir() / "old-logo.png").write_bytes(PNG)
        best = self._logo("http://img.example/new.png", score=90)

        with _patch_http(_FakeResponse(PNG)):
            report = download_primary_assets(self.item)

        self.assertEqual(report["downloaded"], 1)
        self.assertEqual(report["types"], ["logo"])
        stale.refresh_from_db()
        self.assertIsNone(stale.local_name)
        self.assertFalse((asset_dir() / "old-logo.png").exists())
        best.refresh_from_db()
        self.assertTrue(best.local_name)
        self.assertTrue((asset_dir() / best.local_name).is_file())

    def test_collapses_existing_equal_score_duplicates(self) -> None:
        first = self._logo(
            "http://img.example/a.png", score=90, local_name="a.png"
        )
        (asset_dir() / "a.png").write_bytes(PNG)
        second = self._logo(
            "http://img.example/b.png", score=90, local_name="b.png"
        )
        (asset_dir() / "b.png").write_bytes(PNG)

        with _patch_http(_FakeResponse(PNG)):
            report = download_primary_assets(self.item)

        # tie broken deterministically toward the lower pk / already-mirrored row
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertTrue(first.local_name)
        self.assertIsNone(second.local_name)
        self.assertTrue((asset_dir() / "a.png").exists())
        self.assertFalse((asset_dir() / "b.png").exists())
        self.assertEqual(report["downloaded"], 1)

    def test_keeps_existing_copy_when_best_is_already_mirrored(self) -> None:
        # Regression guard: reconcile must not purge a best that is already the
        # mirrored one (idempotent re-download keeps the file, no HTTP call).
        best = self._logo(
            "http://img.example/only.png", score=50, local_name="only.png"
        )
        (asset_dir() / "only.png").write_bytes(PNG)

        with mock.patch("httpx.Client") as client:
            report = download_primary_assets(self.item)

        best.refresh_from_db()
        self.assertEqual(best.local_name, "only.png")
        self.assertTrue((asset_dir() / "only.png").exists())
        client.assert_not_called()
        self.assertEqual(report["downloaded"], 1)


class AutoMirrorArtworkTests(AssetTestCase):
    """``mirror_media_artwork`` gate + best-effort auto-mirroring."""

    def test_mirrors_when_enabled(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        with _patch_http(_FakeResponse(PNG)):
            ran = mirror_media_artwork(self.item.pk)

        self.assertTrue(ran)
        asset = self.item.assets.get()
        asset.refresh_from_db()
        self.assertTrue(asset.local_name)
        self.assertTrue((asset_dir() / asset.local_name).is_file())

    def test_disabled_switch_noops(self) -> None:
        asset = self.add_asset(url="http://img.example/poster.png")
        set_mirroring_enabled(False)
        with mock.patch("httpx.Client") as client:
            ran = mirror_media_artwork(self.item.pk)

        self.assertFalse(ran)
        asset.refresh_from_db()
        self.assertIsNone(asset.local_name)
        client.assert_not_called()

    def test_missing_item_returns_false(self) -> None:
        with mock.patch("httpx.Client") as client:
            ran = mirror_media_artwork(999999)
        self.assertFalse(ran)
        client.assert_not_called()

    def test_mirror_failure_is_swallowed(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        with mock.patch(
            "apps.media.services.assets._best_asset", side_effect=RuntimeError("boom")
        ):
            ran = mirror_media_artwork(self.item.pk)
        self.assertFalse(ran)


class SweepUnmirroredMediaTests(AssetTestCase):
    """``sweep_unmirrored_media`` drains discover items missing local copies."""

    def _item(self, title: str, popularity: float) -> MediaItem:
        return MediaItem.objects.create(
            media_type="movie",
            title=title,
            slug=f"sweep-{title.lower()}-{popularity}",
            popularity=popularity,
        )

    def _poster(
        self,
        item: MediaItem,
        *,
        url: str = "http://img.example/p.png",
        local_name: str | None = None,
    ) -> MediaAsset:
        if local_name:
            (asset_dir() / local_name).write_bytes(PNG)
        return MediaAsset.objects.create(
            media_item=item,
            asset_type="poster",
            url=url,
            score=50,
            local_name=local_name,
            local_size=len(PNG) if local_name else None,
        )

    def test_mirrors_unmirrored_catalog_items(self) -> None:
        items = [
            self._item("Alpha", 100),
            self._item("Bravo", 90),
            self._item("Charlie", 80),
        ]
        for item in items:
            self._poster(item, url=f"http://img.example/{item.slug}.png")

        with _patch_http(_FakeResponse(PNG)):
            report = sweep_unmirrored_media(limit=10)

        self.assertEqual(report["scanned"], 3)
        self.assertEqual(report["mirrored"], 3)
        self.assertEqual(report["bytes"], len(PNG) * 3)
        for item in items:
            asset = MediaAsset.objects.get(media_item=item)
            asset.refresh_from_db()
            self.assertTrue(asset.local_name)

    def test_respects_limit_by_popularity(self) -> None:
        for n in range(1, 6):
            self._poster(self._item(f"Item{n}", float(n)))
        with _patch_http(_FakeResponse(PNG)):
            report = sweep_unmirrored_media(limit=2)
        self.assertEqual(report["scanned"], 2)

    def test_skips_fully_mirrored_and_blank_urls_and_foreign_types(self) -> None:
        # Fully mirrored (local copy present) -> not a candidate.
        mirrored = self._item("Mirrored", 60)
        self._poster(mirrored, local_name="already.png")
        # No usable remote URL -> excluded.
        blank = self._item("Blank", 50)
        self._poster(blank, url="")
        # Only a non-primary asset type -> not a candidate.
        fanart = self._item("Fanart", 40)
        MediaAsset.objects.create(
            media_item=fanart,
            asset_type="fanart",
            url="http://img.example/fan.png",
            score=50,
        )

        with mock.patch("httpx.Client") as client:
            report = sweep_unmirrored_media(limit=10)

        self.assertEqual(report, {"scanned": 0, "mirrored": 0, "bytes": 0})
        client.assert_not_called()

    def test_disabled_switch_noops(self) -> None:
        self._poster(self._item("Alpha", 100))
        set_mirroring_enabled(False)
        with mock.patch("httpx.Client") as client:
            report = sweep_unmirrored_media(limit=10)
        self.assertEqual(report, {"scanned": 0, "mirrored": 0, "bytes": 0})
        client.assert_not_called()

    def test_skips_item_whose_type_is_covered_despite_remote_siblings(self) -> None:
        # Regression: TMDB ships several backdrops/logos per title. Once the
        # best of a type is mirrored, leftover lower-scored sibling URLs must
        # not keep the item a candidate (it would burn a slot and download 0).
        item = self._item("Covered", 100)
        self._poster(item, url="http://img.example/best.png", local_name="best.png")
        MediaAsset.objects.create(
            media_item=item,
            asset_type="poster",
            url="http://img.example/dup.png",
            score=50,
        )

        with mock.patch("httpx.Client") as client:
            report = sweep_unmirrored_media(limit=10)
        self.assertEqual(report, {"scanned": 0, "mirrored": 0, "bytes": 0})
        client.assert_not_called()

    def test_mirrors_only_the_still_uncovered_type(self) -> None:
        # One type already mirrored (poster), one entirely remote (backdrop):
        # the item is still a candidate and the sweep fills the backdrop gap.
        item = self._item("Partial", 90)
        self._poster(item, url="http://img.example/poster.png", local_name="poster.png")
        MediaAsset.objects.create(
            media_item=item,
            asset_type="backdrop",
            url="http://img.example/backdrop.png",
            score=50,
        )

        with _patch_http(_FakeResponse(PNG)):
            report = sweep_unmirrored_media(limit=10)
        self.assertEqual(report["scanned"], 1)
        self.assertEqual(report["mirrored"], 1)
        backdrop = MediaAsset.objects.get(media_item=item, asset_type="backdrop")
        backdrop.refresh_from_db()
        self.assertTrue(backdrop.local_name)


class ArtworkSubSettingTests(AssetTestCase):
    """Defaults + toggling of the fetch/discover/local-games switches & types."""

    def test_defaults(self) -> None:
        self.assertTrue(fetch_enabled())
        self.assertTrue(discover_enabled())
        self.assertFalse(local_games_enabled())
        self.assertEqual(sweep_limit(), settings.MIRROR_SWEEP_LIMIT)
        self.assertEqual(sweep_interval_minutes(), 10)
        self.assertEqual(
            enabled_asset_types(),
            ("poster", "backdrop", "logo", "textless_poster", "icon"),
        )

    def test_min_free_gb_defaults_to_five_when_unset(self) -> None:
        MediaServerSetting.objects.filter(key=MIN_FREE_GB_KEY).delete()
        self.assertEqual(min_free_gb(), 5)

    def test_toggle_setters_roundtrip(self) -> None:
        set_fetch_enabled(False)
        set_discover_enabled(False)
        set_local_games_enabled(True)
        self.assertFalse(fetch_enabled())
        self.assertFalse(discover_enabled())
        self.assertTrue(local_games_enabled())

    def test_asset_types_partial_and_invalid(self) -> None:
        set_asset_types(["poster", "backdrop", "bogus"])
        self.assertEqual(enabled_asset_types(), ("poster", "backdrop"))
        set_asset_types(["logo"])
        self.assertEqual(enabled_asset_types(), ("logo",))

    def test_asset_types_requires_at_least_one(self) -> None:
        with self.assertRaises(ValueError):
            set_asset_types(["bogus"])
        # nothing was persisted
        self.assertEqual(
            enabled_asset_types(),
            ("poster", "backdrop", "logo", "textless_poster", "icon"),
        )

    def test_fetch_toggle_off_blocks_mirror_media_artwork(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        set_fetch_enabled(False)
        with mock.patch("httpx.Client") as client:
            ran = mirror_media_artwork(self.item.pk)
        self.assertFalse(ran)
        client.assert_not_called()
        asset = MediaAsset.objects.get(media_item=self.item)
        asset.refresh_from_db()
        self.assertIsNone(asset.local_name)

    def test_discover_toggle_off_blocks_sweep(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        set_discover_enabled(False)
        with mock.patch("httpx.Client") as client:
            report = sweep_unmirrored_media(limit=10)
        self.assertEqual(report, {"scanned": 0, "mirrored": 0, "bytes": 0})
        client.assert_not_called()

    def test_sweep_only_targets_enabled_types(self) -> None:
        poster_item = MediaItem.objects.create(
            media_type="movie", title="Poster pick", slug="type-poster", popularity=99
        )
        backdrop_item = MediaItem.objects.create(
            media_type="movie", title="Backdrop pick", slug="type-backdrop", popularity=98
        )
        MediaAsset.objects.create(
            media_item=poster_item, asset_type="poster", url="http://x/p.png", score=50
        )
        MediaAsset.objects.create(
            media_item=backdrop_item, asset_type="backdrop", url="http://x/b.png", score=50
        )
        set_asset_types(["poster"])
        with _patch_http(_FakeResponse(PNG)):
            report = sweep_unmirrored_media(limit=10)
        self.assertEqual(report["scanned"], 1)
        poster = MediaAsset.objects.get(media_item=poster_item, asset_type="poster")
        poster.refresh_from_db()
        self.assertTrue(poster.local_name)
        backdrop = MediaAsset.objects.get(media_item=backdrop_item, asset_type="backdrop")
        backdrop.refresh_from_db()
        self.assertIsNone(backdrop.local_name)


class DiskCapTests(AssetTestCase):
    """The disk safety cap pauses new downloads when free space is low."""

    def test_download_skips_when_below_cap(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        set_min_free_gb(5)
        with mock.patch(
            "apps.media.services.assets.disk_free_bytes", return_value=1
        ) as _free, mock.patch("httpx.Client") as client:
            written = download_asset(MediaAsset.objects.get(media_item=self.item))
        self.assertIsNone(written)
        client.assert_not_called()

    def test_download_proceeds_when_cap_disabled(self) -> None:
        asset = self.add_asset(url="http://img.example/poster.png")
        set_min_free_gb(0)
        with mock.patch("apps.media.services.assets.disk_free_bytes", return_value=1):
            with _patch_http(_FakeResponse(PNG)):
                written = download_asset(asset)
        self.assertEqual(written, len(PNG))
        asset.refresh_from_db()
        self.assertTrue(asset.local_name)

    def test_min_free_gb_zero_roundtrip(self) -> None:
        set_min_free_gb(0)
        self.assertEqual(min_free_gb(), 0)
        self.assertTrue(disk_safe())


class LocalGameMirrorTests(AssetTestCase):
    """``mirror_local_game_artwork`` mirrors only games when its toggle is on."""

    def _game(self) -> MediaItem:
        return MediaItem.objects.create(
            media_type="game", title="Hades", slug="local-game-hades"
        )

    def test_mirrors_game_when_enabled(self) -> None:
        game = self._game()
        MediaAsset.objects.create(
            media_item=game, asset_type="poster", url="http://img.example/hades.png", score=50
        )
        set_local_games_enabled(True)
        with _patch_http(_FakeResponse(PNG)):
            ran = mirror_local_game_artwork(game.pk)
        self.assertTrue(ran)
        poster = MediaAsset.objects.get(media_item=game, asset_type="poster")
        poster.refresh_from_db()
        self.assertTrue(poster.local_name)

    def test_skips_non_game(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        set_local_games_enabled(True)
        with mock.patch("httpx.Client") as client:
            ran = mirror_local_game_artwork(self.item.pk)
        self.assertFalse(ran)
        client.assert_not_called()

    def test_skips_when_toggle_off(self) -> None:
        game = self._game()
        MediaAsset.objects.create(
            media_item=game, asset_type="poster", url="http://img.example/hades.png", score=50
        )
        with mock.patch("httpx.Client") as client:
            ran = mirror_local_game_artwork(game.pk)
        self.assertFalse(ran)
        client.assert_not_called()

    def test_skips_when_master_off(self) -> None:
        game = self._game()
        MediaAsset.objects.create(
            media_item=game, asset_type="poster", url="http://img.example/hades.png", score=50
        )
        set_local_games_enabled(True)
        set_mirroring_enabled(False)
        with mock.patch("httpx.Client") as client:
            ran = mirror_local_game_artwork(game.pk)
        self.assertFalse(ran)
        client.assert_not_called()


class SweepThrottleTests(AssetTestCase):
    """``should_run_sweep`` lets the beat task throttle to a configured interval."""

    def test_first_run_then_blocked_within_interval(self) -> None:
        set_sweep_interval_minutes(10)
        self.assertTrue(should_run_sweep())  # no recorded run yet
        record_sweep_run()
        self.assertFalse(should_run_sweep())  # just ran

    def test_zero_interval_runs_every_tick(self) -> None:
        set_sweep_interval_minutes(0)
        record_sweep_run()
        self.assertTrue(should_run_sweep())

    def test_elapsed_interval_allows_run(self) -> None:
        set_sweep_interval_minutes(10)
        record_sweep_run()
        past = (timezone.now() - timedelta(minutes=11)).isoformat()
        MediaServerSetting.objects.filter(key=SWEEP_LAST_RUN_KEY).update(value=past)
        self.assertTrue(should_run_sweep())


class ArtworkSettingsEndpointTests(AssetTestCase):
    """``/api/v1/media/admin/artwork-settings`` GET/PUT round-trip + gating."""

    def _url(self) -> str:
        return "/api/v1/media/admin/artwork-settings"

    def test_get_returns_payload(self) -> None:
        response = self.staff_client.get(self._url())
        self.assertEqual(response.status_code, 200)
        body = response.data
        for key in (
            "fetch_enabled",
            "discover_enabled",
            "local_games_enabled",
            "sweep_limit",
            "sweep_interval_minutes",
            "asset_types",
            "min_free_gb",
            "disk",
        ):
            self.assertIn(key, body)
        self.assertIs(body["fetch_enabled"], True)
        self.assertIs(body["local_games_enabled"], False)
        self.assertIn("tripped", body["disk"])

    def test_put_updates_fields(self) -> None:
        response = self.staff_client.put(
            self._url(),
            {
                "fetch_enabled": False,
                "asset_types": ["poster", "backdrop"],
                "min_free_gb": 2,
                "sweep_interval_minutes": 30,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["fetch_enabled"], False)
        self.assertEqual(response.data["asset_types"], ["poster", "backdrop"])
        self.assertEqual(response.data["min_free_gb"], 2)
        self.assertFalse(fetch_enabled())
        self.assertEqual(enabled_asset_types(), ("poster", "backdrop"))

    def test_put_rejects_bad_values(self) -> None:
        for payload in (
            {"fetch_enabled": "yes"},
            {"min_free_gb": -1},
            {"sweep_limit": "x"},
            {"asset_types": []},
            {"asset_types": ["bogus"]},
        ):
            response = self.staff_client.put(self._url(), payload, format="json")
            self.assertEqual(response.status_code, 400, payload)
        # nothing was persisted
        self.assertTrue(fetch_enabled())
        self.assertEqual(
            enabled_asset_types(),
            ("poster", "backdrop", "logo", "textless_poster", "icon"),
        )

    def test_staff_gating(self) -> None:
        self.assertEqual(self.client.get(self._url()).status_code, 401)
        self.assertEqual(self.user_client.get(self._url()).status_code, 403)
        self.assertEqual(
            self.user_client.put(self._url(), {"fetch_enabled": False}).status_code, 403
        )
