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
    MATERIALIZED_TEXTLESS_LABEL,
    MIN_FREE_GB_KEY,
    SWEEP_LAST_RUN_KEY,
    asset_dir,
    clear_asset_selection,
    current_primary_asset_ids,
    discover_enabled,
    disk_safe,
    download_asset,
    download_primary_assets,
    enabled_asset_types,
    fetch_enabled,
    keep_asset,
    local_games_enabled,
    max_gb,
    min_free_gb,
    mirror_local_game_artwork,
    mirror_media_artwork,
    mirrored_usage,
    mirroring_enabled,
    record_sweep_run,
    select_asset,
    set_asset_types,
    set_discover_enabled,
    set_fetch_enabled,
    set_local_games_enabled,
    set_min_free_gb,
    set_mirroring_enabled,
    set_sweep_interval_minutes,
    set_textless_pick,
    should_run_sweep,
    sweep_interval_minutes,
    sweep_limit,
    sweep_unmirrored_media,
)
from apps.media.services.catalog import _best_asset, _pick_asset, _pick_backdrop

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
        cls._media_tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
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
                shutil.rmtree(child, ignore_errors=True)
            else:
                try:
                    child.unlink()
                except OSError:
                    pass

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

        self.item = MediaItem.objects.create(media_type="movie", title="Dune", slug="dune-assets")

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
        provider: str | None = None,
    ) -> MediaAsset:
        return MediaAsset.objects.create(
            media_item=self.item,
            asset_type=asset_type,
            url=url,
            score=score,
            local_name=local_name,
            provider=provider,
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
        self.assertEqual({p.name for p in asset_dir().iterdir()}, {"existing.png"})

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


class BackdropPickTests(AssetTestCase):
    def setUp(self) -> None:
        super().setUp()
        # Designating a textless pick auto-mirrors when the master switch is on;
        # these resolution tests only exercise the pick, not downloads.
        set_mirroring_enabled(False)

    def test_textless_backdrop_wins_over_texted_pin_in_every_context(self) -> None:
        # A high-scoring texted backdrop is pinned as the general backdrop pick…
        texted = self.add_asset(
            asset_type="backdrop", url="http://img.example/texted.png", score=90
        )
        select_asset(self.item, texted, "general")
        # …but the admin also designates a *different* backdrop as the textless art.
        textless_source = self.add_asset(
            asset_type="backdrop", url="http://img.example/tless.png", score=10
        )
        set_textless_pick(self.item, textless_source, True)
        twin = _best_asset(self.item, "textless_backdrop", "general")
        self.assertEqual(twin.url, "http://img.example/tless.png")
        for context in ("general", "dark", "light"):
            self.assertEqual(_pick_backdrop(self.item, context), "http://img.example/tless.png")

    def test_falls_back_to_backdrop_when_no_textless(self) -> None:
        self.add_asset(asset_type="backdrop", url="http://img.example/bd.png")
        self.assertIsNone(_best_asset(self.item, "textless_backdrop", "general"))
        for context in ("general", "dark", "light"):
            self.assertEqual(_pick_backdrop(self.item, context), "http://img.example/bd.png")

    def test_local_mirrored_textless_backdrop_serves_local_url(self) -> None:
        self.add_asset(asset_type="backdrop", url="http://img.example/bd.png")
        self.add_asset(
            asset_type="textless_backdrop",
            url="http://img.example/tless.png",
            local_name="tless-abc123.png",
            score=40,
        )
        self.assertEqual(_pick_backdrop(self.item, "light"), "/api/v1/assets/tless-abc123.png")


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
        response = self.staff_client.post("/api/v1/media/admin/media-items/999999/download-assets")
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

    def test_download_endpoint_with_slug(self) -> None:
        self.add_asset(url="http://img.example/poster.png")
        url = f"/api/v1/media/admin/media-items/{self.item.slug}/download-assets"
        with _patch_http(_FakeResponse(PNG)):
            response = self.staff_client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["downloaded"], 1)

    def test_artwork_select_endpoint_with_pk_and_slug(self) -> None:
        asset = self.add_asset(asset_type="poster", url="http://img.example/poster1.png")
        slug_url = f"/api/v1/media/admin/media-items/{self.item.slug}/assets/{asset.pk}/select"
        with _patch_http(_FakeResponse(PNG)):
            res = self.staff_client.put(slug_url, {"context": "general"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["selected_context"], "general")
        asset.refresh_from_db()
        self.assertEqual(asset.selected_context, "general")

        pk_url = f"/api/v1/media/admin/media-items/{self.item.pk}/assets/{asset.pk}/select"
        res_del = self.staff_client.delete(pk_url)
        self.assertEqual(res_del.status_code, 200)
        asset.refresh_from_db()
        self.assertIsNone(asset.selected_context)

    def test_artwork_textless_and_mirror_endpoints_with_slug(self) -> None:
        asset = self.add_asset(asset_type="poster", url="http://img.example/textless.png")
        textless_url = f"/api/v1/media/admin/media-items/{self.item.slug}/assets/{asset.pk}/textless"
        with _patch_http(_FakeResponse(PNG)):
            res = self.staff_client.put(textless_url)
        self.assertEqual(res.status_code, 200)

        mirror_url = f"/api/v1/media/admin/media-items/{self.item.slug}/assets/{asset.pk}/mirror"
        with _patch_http(_FakeResponse(PNG)):
            res_mirror = self.staff_client.put(mirror_url)
        self.assertEqual(res_mirror.status_code, 200)
        self.assertTrue(res_mirror.data["kept"])

    def test_media_assets_view_with_slug(self) -> None:
        self.add_asset(asset_type="poster", url="http://img.example/poster.png")
        url = f"/api/v1/media/movie/{self.item.slug}/assets"
        res = self.staff_client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["items"]), 1)


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
        stale = self._logo("http://img.example/old.png", score=80, local_name="old-logo.png")
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
        first = self._logo("http://img.example/a.png", score=90, local_name="a.png")
        (asset_dir() / "a.png").write_bytes(PNG)
        second = self._logo("http://img.example/b.png", score=90, local_name="b.png")
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
        best = self._logo("http://img.example/only.png", score=50, local_name="only.png")
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
        with mock.patch("apps.media.services.assets._best_asset", side_effect=RuntimeError("boom")):
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
        with (
            mock.patch("apps.media.services.assets.disk_free_bytes", return_value=1) as _free,
            mock.patch("httpx.Client") as client,
        ):
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
        return MediaItem.objects.create(media_type="game", title="Hades", slug="local-game-hades")

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


class ArtworkSelectionServiceTests(AssetTestCase):
    """Theme-scoped admin-pinning: context selection, ranking, mirroring."""

    def test_select_general_pins_and_clears_general_siblings(self) -> None:
        set_mirroring_enabled(False)
        low = self.add_asset(url="http://img.example/a.png", score=50)
        high = self.add_asset(url="http://img.example/b.png", score=90)
        backdrop = self.add_asset(asset_type="backdrop", url="http://img.example/bd.png", score=10)
        select_asset(self.item, low, "general")
        low.refresh_from_db()
        high.refresh_from_db()
        backdrop.refresh_from_db()
        self.assertEqual(low.selected_context, "general")
        self.assertIsNone(high.selected_context)
        self.assertIsNone(backdrop.selected_context)

    def test_select_dark_clears_only_dark_sibling(self) -> None:
        set_mirroring_enabled(False)
        dark_a = self.add_asset(url="http://img.example/da.png", score=50)
        dark_b = self.add_asset(url="http://img.example/db.png", score=60)
        general = self.add_asset(url="http://img.example/g.png", score=90)
        select_asset(self.item, dark_a, "dark")
        select_asset(self.item, general, "general")
        dark_a.refresh_from_db()
        dark_b.refresh_from_db()
        general.refresh_from_db()
        self.assertEqual(dark_a.selected_context, "dark")
        self.assertIsNone(dark_b.selected_context)
        # general pin survived the dark pin and vice-versa
        self.assertEqual(general.selected_context, "general")

    def test_best_asset_prefers_exact_context_then_general_then_score(self) -> None:
        set_mirroring_enabled(False)
        top = self.add_asset(url="http://img.example/top.png", score=90)
        general = self.add_asset(url="http://img.example/gen.png", score=50)
        dark = self.add_asset(url="http://img.example/dark.png", score=10)
        select_asset(self.item, general, "general")
        # default context resolves to the general pin
        self.assertEqual(_best_asset(self.item, "poster").pk, general.pk)
        # dark has no dark pin yet -> general pin wins over the higher score
        self.assertEqual(_best_asset(self.item, "poster", "dark").pk, general.pk)
        select_asset(self.item, dark, "dark")
        self.assertEqual(_best_asset(self.item, "poster", "dark").pk, dark.pk)
        # general still resolves to the general pin, not the dark one
        self.assertEqual(_best_asset(self.item, "poster").pk, general.pk)
        clear_asset_selection(general)
        # no pins left for general context -> highest score
        self.assertEqual(_best_asset(self.item, "poster").pk, top.pk)

    def test_general_pin_is_fallback_for_light(self) -> None:
        set_mirroring_enabled(False)
        self.add_asset(url="http://img.example/a.png", score=80)
        general = self.add_asset(url="http://img.example/gen.png", score=30)
        select_asset(self.item, general, "general")
        self.assertEqual(_best_asset(self.item, "poster", "light").pk, general.pk)
        self.assertEqual(_pick_asset(self.item, "poster", "light"), "http://img.example/gen.png")

    def test_clear_asset_selection_leaves_other_contexts_alone(self) -> None:
        set_mirroring_enabled(False)
        dark = self.add_asset(url="http://img.example/d.png", score=40)
        general = self.add_asset(url="http://img.example/g.png", score=40)
        select_asset(self.item, dark, "dark")
        select_asset(self.item, general, "general")
        clear_asset_selection(dark)
        dark.refresh_from_db()
        general.refresh_from_db()
        self.assertIsNone(dark.selected_context)
        self.assertEqual(general.selected_context, "general")

    def test_current_primary_asset_ids_is_context_aware(self) -> None:
        set_mirroring_enabled(False)
        best = self.add_asset(url="http://img.example/a.png", score=90)
        dark = self.add_asset(url="http://img.example/dark.png", score=10)
        backdrop = self.add_asset(asset_type="backdrop", url="http://img.example/bd.png", score=70)
        select_asset(self.item, dark, "dark")
        self.assertEqual(current_primary_asset_ids(self.item, "dark"), {dark.pk, backdrop.pk})
        # general context falls back to the score winner
        self.assertEqual(current_primary_asset_ids(self.item, "general"), {best.pk, backdrop.pk})
        clear_asset_selection(dark)
        self.assertEqual(current_primary_asset_ids(self.item, "dark"), {best.pk, backdrop.pk})

    def test_select_mirrors_choice_and_discards_stale_local(self) -> None:
        stale_file = "stale-poster.png"
        (asset_dir() / stale_file).write_bytes(PNG)
        former = self.add_asset(
            url="http://img.example/former.png",
            score=90,
            local_name=stale_file,
        )
        chosen = self.add_asset(url="http://img.example/chosen.png", score=40)
        with _patch_http(_FakeResponse(PNG)):
            select_asset(self.item, chosen, "general")
        former.refresh_from_db()
        chosen.refresh_from_db()
        self.assertEqual(chosen.selected_context, "general")
        self.assertTrue(chosen.local_name)
        self.assertTrue(chosen.local_name.endswith(".png"))
        self.assertTrue((asset_dir() / chosen.local_name).is_file())
        # the previously mirrored sibling is no longer a winner -> discarded
        self.assertIsNone(former.local_name)
        self.assertFalse((asset_dir() / stale_file).exists())

    def test_select_mirrors_distinct_context_winners(self) -> None:
        set_mirroring_enabled(True)
        best = self.add_asset(url="http://img.example/best.png", score=90)
        dark = self.add_asset(url="http://img.example/dark.png", score=10)
        light = self.add_asset(url="http://img.example/light.png", score=10)
        with _patch_http(_FakeResponse(PNG)):
            select_asset(self.item, dark, "dark")
        with _patch_http(_FakeResponse(PNG)):
            select_asset(self.item, light, "light")
        for asset in (best, dark, light):
            asset.refresh_from_db()
            self.assertTrue(asset.local_name)

    def test_select_does_not_mirror_when_master_off(self) -> None:
        set_mirroring_enabled(False)
        asset = self.add_asset(url="http://img.example/x.png", score=50)
        select_asset(self.item, asset, "general")
        asset.refresh_from_db()
        self.assertEqual(asset.selected_context, "general")
        self.assertIsNone(asset.local_name)


class TextlessPickServiceTests(AssetTestCase):
    """Marking an image as the family's (theme-agnostic) textless art."""

    def setUp(self) -> None:
        super().setUp()
        set_mirroring_enabled(False)

    def _image(self, asset_type: str, url: str, **kw) -> MediaAsset:
        return self.add_asset(
            asset_type=asset_type,
            url=url,
            score=kw.pop("score", 50),
            provider=kw.pop("provider", "tmdb"),
            **kw,
        )

    def test_designate_poster_materializes_a_textless_poster_twin(self) -> None:
        poster = self._image("poster", "http://img.example/p.png", score=70)
        result = set_textless_pick(self.item, poster, True)

        self.assertEqual(result["asset_id"], poster.pk)
        self.assertTrue(result["active"])
        twin = _best_asset(self.item, "textless_poster", "general")
        self.assertIsNotNone(twin)
        self.assertEqual(twin.url, poster.url)
        self.assertEqual(twin.score, 70)
        self.assertEqual(twin.provider, "tmdb")
        self.assertEqual(twin.label, MATERIALIZED_TEXTLESS_LABEL)
        self.assertEqual(twin.selected_context, "general")
        # the poster row itself is untouched by the designation
        poster.refresh_from_db()
        self.assertIsNone(poster.selected_context)

    def test_designate_backdrop_materializes_a_textless_backdrop(self) -> None:
        backdrop = self._image("backdrop", "http://img.example/bd.png")
        set_textless_pick(self.item, backdrop, True)
        twin = _best_asset(self.item, "textless_backdrop", "general")
        self.assertEqual(twin.asset_type, "textless_backdrop")
        self.assertEqual(twin.url, backdrop.url)
        self.assertEqual(twin.selected_context, "general")

    def test_pick_is_one_theme_agnostic_image(self) -> None:
        poster = self._image("poster", "http://img.example/p.png")
        set_textless_pick(self.item, poster, True)
        for context in ("general", "dark", "light"):
            self.assertEqual(
                _best_asset(self.item, "textless_poster", context).url,
                poster.url,
            )

    def test_designating_second_image_moves_pick_and_prunes_first(self) -> None:
        a = self._image("poster", "http://img.example/a.png")
        b = self._image("poster", "http://img.example/b.png")
        set_textless_pick(self.item, a, True)
        first = _best_asset(self.item, "textless_poster", "general")
        set_textless_pick(self.item, b, True)
        self.assertFalse(MediaAsset.objects.filter(pk=first.pk, media_item=self.item).exists())
        self.assertEqual(_best_asset(self.item, "textless_poster", "general").url, b.url)

    def test_undesignate_clears_and_prunes_materialized_row(self) -> None:
        poster = self._image("poster", "http://img.example/p.png")
        set_textless_pick(self.item, poster, True)
        result = set_textless_pick(self.item, poster, False)
        self.assertFalse(result["active"])
        self.assertIsNone(_best_asset(self.item, "textless_poster", "general"))
        self.assertFalse(
            MediaAsset.objects.filter(media_item=self.item, asset_type="textless_poster").exists()
        )
        poster.refresh_from_db()
        self.assertIsNone(poster.selected_context)

    def test_undesignating_a_non_pick_is_a_noop(self) -> None:
        # an unrelated provider textless_poster stays untouched
        provider_twin = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="textless_poster",
            url="http://img.example/t.png",
            score=90,
            provider="fanart",
        )
        poster = self._image("poster", "http://img.example/p.png")
        result = set_textless_pick(self.item, poster, False)
        self.assertFalse(result["active"])
        provider_twin.refresh_from_db()
        self.assertIsNone(provider_twin.selected_context)

    def test_designate_reuses_a_provider_textless_row_with_same_url(self) -> None:
        poster = self._image("poster", "http://img.example/p.png")
        existing = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="textless_poster",
            url="http://img.example/p.png",
            score=30,
        )
        set_textless_pick(self.item, poster, True)
        existing.refresh_from_db()
        self.assertEqual(existing.selected_context, "general")
        self.assertIsNone(existing.label)  # provider row, not a materialized twin
        self.assertEqual(
            MediaAsset.objects.filter(media_item=self.item, asset_type="textless_poster").count(),
            1,
        )

    def test_undesignate_provider_row_keeps_the_row(self) -> None:
        poster = self._image("poster", "http://img.example/p.png")
        existing = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="textless_poster",
            url="http://img.example/p.png",
            score=30,
        )
        set_textless_pick(self.item, poster, True)
        set_textless_pick(self.item, poster, False)
        existing.refresh_from_db()
        self.assertIsNone(existing.selected_context)
        self.assertTrue(MediaAsset.objects.filter(pk=existing.pk).exists())

    def test_designate_mirrors_when_master_on(self) -> None:
        set_mirroring_enabled(True)
        poster = self._image("poster", "http://img.example/p.png")
        with _patch_http(_FakeResponse(PNG)):
            result = set_textless_pick(self.item, poster, True)
        self.assertTrue(result["mirrored"])
        twin = _best_asset(self.item, "textless_poster", "general")
        self.assertTrue(twin.local_name)

    def test_logo_has_no_textless_slot(self) -> None:
        logo = self._image("logo", "http://img.example/l.png")
        with self.assertRaises(ValueError):
            set_textless_pick(self.item, logo, True)


class ArtworkSelectionEndpointTests(AssetTestCase):
    """``/api/v1/media/admin/media-items/<id>/assets/<id>/select`` PUT/DELETE."""

    def setUp(self) -> None:
        super().setUp()
        set_mirroring_enabled(False)  # pin semantics here, downloads tested below

    def _url(self, asset_id: int) -> str:
        return f"/api/v1/media/admin/media-items/{self.item.pk}/assets/{asset_id}/select"

    def test_put_defaults_to_general_and_delete_clears(self) -> None:
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        put = self.staff_client.put(self._url(asset.pk))
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.data["selected_context"], "general")
        asset.refresh_from_db()
        self.assertEqual(asset.selected_context, "general")

        delete = self.staff_client.delete(self._url(asset.pk))
        self.assertEqual(delete.status_code, 200)
        self.assertEqual(delete.data["selected_context"], None)
        asset.refresh_from_db()
        self.assertIsNone(asset.selected_context)

    def test_put_dark_selects_dark_context_only(self) -> None:
        a = self.add_asset(url="http://img.example/a.png", score=90)
        b = self.add_asset(url="http://img.example/b.png", score=50)
        put = self.staff_client.put(self._url(b.pk), {"context": "dark"})
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.data["selected_context"], "dark")
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertIsNone(a.selected_context)
        self.assertEqual(b.selected_context, "dark")

    def test_put_light_and_dark_pins_coexist(self) -> None:
        dark = self.add_asset(url="http://img.example/d.png", score=50)
        light = self.add_asset(url="http://img.example/l.png", score=50)
        self.assertEqual(
            self.staff_client.put(self._url(dark.pk), {"context": "dark"}).status_code,
            200,
        )
        self.assertEqual(
            self.staff_client.put(self._url(light.pk), {"context": "light"}).status_code,
            200,
        )
        dark.refresh_from_db()
        light.refresh_from_db()
        self.assertEqual(dark.selected_context, "dark")
        self.assertEqual(light.selected_context, "light")

    def test_put_bad_context_returns_400(self) -> None:
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        response = self.staff_client.put(self._url(asset.pk), {"context": "sepia"})
        self.assertEqual(response.status_code, 400)

    def test_put_mirrors_when_mirroring_enabled(self) -> None:
        set_mirroring_enabled(True)
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        with _patch_http(_FakeResponse(PNG)):
            response = self.staff_client.put(self._url(asset.pk), {"context": "general"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mirrored"], True)
        asset.refresh_from_db()
        self.assertTrue(asset.local_name)

    def test_put_pins_registered_optional_slot(self) -> None:
        # textless_backdrop is a selectable slot even though it is not part of
        # the auto-mirror default set (no provider populates it yet).
        tb = self.add_asset(
            asset_type="textless_backdrop",
            url="http://img.example/tb.png",
            score=50,
        )
        put = self.staff_client.put(self._url(tb.pk), {"context": "dark"})
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.data["selected_context"], "dark")
        tb.refresh_from_db()
        self.assertEqual(tb.selected_context, "dark")

    def test_gating_and_validation(self) -> None:
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        self.assertEqual(self.client.put(self._url(asset.pk)).status_code, 401)
        self.assertEqual(self.user_client.put(self._url(asset.pk)).status_code, 403)

        # only selectable artwork types can be pinned
        shot = self.add_asset(asset_type="screenshot", url="http://img.example/sh.png", score=5)
        self.assertEqual(self.staff_client.put(self._url(shot.pk)).status_code, 400)

        # asset must belong to the media item
        other_item = MediaItem.objects.create(
            media_type="movie", title="Other", slug="other-assets"
        )
        foreign = MediaAsset.objects.create(
            media_item=other_item,
            asset_type="poster",
            url="http://img.example/foreign.png",
            score=5,
        )
        self.assertEqual(self.staff_client.put(self._url(foreign.pk)).status_code, 404)
        self.assertEqual(self.staff_client.delete(self._url(foreign.pk)).status_code, 404)


class TextlessPickEndpointTests(AssetTestCase):
    """``.../assets/<id>/textless`` PUT designates / DELETE clears the pick."""

    def setUp(self) -> None:
        super().setUp()
        set_mirroring_enabled(False)

    def _url(self, asset_id: int) -> str:
        return f"/api/v1/media/admin/media-items/{self.item.pk}/assets/{asset_id}/textless"

    def test_put_designates_a_poster_as_the_family_textless(self) -> None:
        poster = self.add_asset(
            asset_type="poster",
            url="http://img.example/p.png",
            score=70,
            provider="tmdb",
        )
        put = self.staff_client.put(self._url(poster.pk))
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.data["asset_id"], poster.pk)
        self.assertIs(put.data["active"], True)
        twin = _best_asset(self.item, "textless_poster", "general")
        self.assertEqual(twin.url, poster.url)
        self.assertEqual(twin.selected_context, "general")
        poster.refresh_from_db()
        self.assertIsNone(poster.selected_context)

    def test_put_backdrop_designates_textless_backdrop(self) -> None:
        backdrop = self.add_asset(asset_type="backdrop", url="http://img.example/bd.png", score=50)
        put = self.staff_client.put(self._url(backdrop.pk))
        self.assertEqual(put.status_code, 200)
        self.assertIs(put.data["active"], True)
        twin = _best_asset(self.item, "textless_backdrop", "general")
        self.assertEqual(twin.url, backdrop.url)

    def test_delete_clears_the_designation_and_prunes_the_row(self) -> None:
        poster = self.add_asset(asset_type="poster", url="http://img.example/p.png", score=50)
        self.staff_client.put(self._url(poster.pk))
        delete = self.staff_client.delete(self._url(poster.pk))
        self.assertEqual(delete.status_code, 200)
        self.assertIs(delete.data["active"], False)
        self.assertIsNone(_best_asset(self.item, "textless_poster", "general"))
        self.assertFalse(
            MediaAsset.objects.filter(media_item=self.item, asset_type="textless_poster").exists()
        )

    def test_list_hides_the_twin_and_marks_the_source_image(self) -> None:
        poster = self.add_asset(asset_type="poster", url="http://img.example/p.png", score=50)
        self.staff_client.put(self._url(poster.pk))
        got = self.staff_client.get(f"/api/v1/media/movie/{self.item.pk}/assets")
        self.assertEqual(got.status_code, 200)
        rows = {row["id"]: row for row in got.data["items"]}
        self.assertIn(poster.pk, rows)
        self.assertIs(rows[poster.pk]["is_textless"], True)
        # the materialized twin is hidden so the grid shows the source card only
        self.assertTrue(all(row["asset_type"] != "textless_poster" for row in got.data["items"]))

    def test_gating_and_validation(self) -> None:
        poster = self.add_asset(asset_type="poster", url="http://img.example/p.png", score=50)
        self.assertEqual(self.client.put(self._url(poster.pk)).status_code, 401)
        self.assertEqual(self.user_client.put(self._url(poster.pk)).status_code, 403)
        self.assertEqual(self.user_client.delete(self._url(poster.pk)).status_code, 403)

        # a logo has no textless slot
        logo = self.add_asset(asset_type="logo", url="http://img.example/l.png", score=50)
        self.assertEqual(self.staff_client.put(self._url(logo.pk)).status_code, 400)

        other_item = MediaItem.objects.create(
            media_type="movie", title="Other", slug="other-textless"
        )
        foreign = MediaAsset.objects.create(
            media_item=other_item,
            asset_type="poster",
            url="http://img.example/foreign.png",
            score=5,
        )
        self.assertEqual(self.staff_client.put(self._url(foreign.pk)).status_code, 404)


class KeepMirrorServiceTests(AssetTestCase):
    """Admin keep-set: mirror a non-winner variant and keep it through reconciles."""

    def _mirrored_winner_and_variant(self) -> tuple[MediaAsset, MediaAsset]:
        best = self.add_asset(url="http://img.example/best.png", score=90)
        kept = self.add_asset(url="http://img.example/kept.png", score=10)
        with _patch_http(_FakeResponse(PNG)):
            download_primary_assets(self.item)
        best.refresh_from_db()
        kept.refresh_from_db()
        self.assertTrue(best.local_name)  # winner mirrored, variant not yet
        self.assertIsNone(kept.local_name)
        return best, kept

    def test_keep_mirrors_variant_and_survives_reconcile(self) -> None:
        set_mirroring_enabled(True)
        best, kept = self._mirrored_winner_and_variant()

        with _patch_http(_FakeResponse(PNG)):
            keep_asset(self.item, kept, True)
        kept.refresh_from_db()
        self.assertTrue(kept.keep_local)
        self.assertTrue(kept.local_name)
        self.assertTrue((asset_dir() / kept.local_name).is_file())

        # a re-reconcile must not discard the admin-kept non-winner variant
        with _patch_http(_FakeResponse(PNG)):
            download_primary_assets(self.item)
        best.refresh_from_db()
        kept.refresh_from_db()
        self.assertTrue(best.local_name)
        self.assertTrue(kept.local_name)
        self.assertTrue((asset_dir() / kept.local_name).is_file())

    def test_unkeep_non_winner_frees_local_copy(self) -> None:
        set_mirroring_enabled(True)
        best, kept = self._mirrored_winner_and_variant()
        with _patch_http(_FakeResponse(PNG)):
            keep_asset(self.item, kept, True)
        kept.refresh_from_db()
        kept_file = kept.local_name
        self.assertTrue(kept_file)

        result = keep_asset(self.item, kept, False)
        kept.refresh_from_db()
        best.refresh_from_db()
        self.assertEqual(result["kept"], False)
        self.assertEqual(result["mirrored"], False)
        self.assertFalse(kept.keep_local)
        self.assertIsNone(kept.local_name)
        self.assertFalse((asset_dir() / kept_file).exists())
        # the winner stays mirrored
        self.assertTrue(best.local_name)

    def test_unkeep_winner_keeps_mirror_because_still_wanted(self) -> None:
        set_mirroring_enabled(True)
        # only asset of the type -> it is the winner for every context, so
        # un-keeping must not free its local copy.
        best = self.add_asset(url="http://img.example/best.png", score=90)
        with _patch_http(_FakeResponse(PNG)):
            download_primary_assets(self.item)
        best.refresh_from_db()
        self.assertTrue(best.local_name)

        keep_asset(self.item, best, True)
        result = keep_asset(self.item, best, False)
        best.refresh_from_db()
        self.assertEqual(result["mirrored"], True)
        self.assertTrue(best.local_name)

    def test_keep_does_not_download_when_master_off(self) -> None:
        set_mirroring_enabled(False)
        asset = self.add_asset(url="http://img.example/x.png", score=50)
        result = keep_asset(self.item, asset, True)
        asset.refresh_from_db()
        self.assertEqual(result["kept"], True)
        self.assertEqual(result["mirrored"], False)
        self.assertTrue(asset.keep_local)
        self.assertIsNone(asset.local_name)


class KeepMirrorEndpointTests(AssetTestCase):
    """``/api/v1/media/admin/media-items/<id>/assets/<id>/mirror`` PUT/DELETE."""

    def setUp(self) -> None:
        super().setUp()
        set_mirroring_enabled(True)

    def _url(self, asset_id: int) -> str:
        return f"/api/v1/media/admin/media-items/{self.item.pk}/assets/{asset_id}/mirror"

    def test_put_mirrors_and_keeps(self) -> None:
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        with _patch_http(_FakeResponse(PNG)):
            response = self.staff_client.put(self._url(asset.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["kept"], True)
        self.assertEqual(response.data["mirrored"], True)
        asset.refresh_from_db()
        self.assertTrue(asset.keep_local)
        self.assertTrue(asset.local_name)

    def test_put_keeps_flag_without_download_when_master_off(self) -> None:
        set_mirroring_enabled(False)
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        with mock.patch("httpx.Client") as client:
            response = self.staff_client.put(self._url(asset.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mirrored"], False)
        client.assert_not_called()
        asset.refresh_from_db()
        self.assertTrue(asset.keep_local)
        self.assertIsNone(asset.local_name)

    def test_delete_unkeeps_and_frees_non_winner_local(self) -> None:
        kept = self.add_asset(url="http://img.example/kept.png", score=10)
        winner = self.add_asset(url="http://img.example/winner.png", score=90)
        # mirror both the winner and the kept variant so both hold local copies
        with _patch_http(_FakeResponse(PNG)):
            self.staff_client.put(self._url(kept.pk))
            self.staff_client.put(self._url(winner.pk))
        winner.refresh_from_db()
        kept.refresh_from_db()
        self.assertTrue(winner.local_name)
        kept_file = kept.local_name
        self.assertTrue(kept_file)

        with _patch_http(_FakeResponse(PNG)):
            response = self.staff_client.delete(self._url(kept.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["kept"], False)
        self.assertEqual(response.data["mirrored"], False)
        kept.refresh_from_db()
        self.assertFalse(kept.keep_local)
        self.assertIsNone(kept.local_name)
        self.assertFalse((asset_dir() / kept_file).exists())

    def test_gating_and_validation(self) -> None:
        asset = self.add_asset(url="http://img.example/p.png", score=50)
        self.assertEqual(self.client.put(self._url(asset.pk)).status_code, 401)
        self.assertEqual(self.user_client.put(self._url(asset.pk)).status_code, 403)
        self.assertEqual(self.client.delete(self._url(asset.pk)).status_code, 401)
        self.assertEqual(self.user_client.delete(self._url(asset.pk)).status_code, 403)

        other_item = MediaItem.objects.create(
            media_type="movie", title="Other", slug="other-mirror"
        )
        foreign = MediaAsset.objects.create(
            media_item=other_item,
            asset_type="poster",
            url="http://img.example/foreign.png",
            score=5,
        )
        self.assertEqual(self.staff_client.put(self._url(foreign.pk)).status_code, 404)
        self.assertEqual(self.staff_client.delete(self._url(foreign.pk)).status_code, 404)


class ArtworkBudgetTests(AssetTestCase):
    """``mirror_max_gb`` budget: track served usage, evict least-used on overflow."""

    def _seed_local(
        self,
        name: str,
        size: int,
        *,
        usage: int = 0,
        keep: bool = False,
        pinned: bool = False,
    ) -> MediaAsset:
        (asset_dir() / name).write_bytes(b"\0" * size)
        return MediaAsset.objects.create(
            media_item=self.item,
            asset_type="poster",
            url=f"http://img.example/{name}",
            score=50,
            local_name=name,
            local_size=size,
            downloaded_at=timezone.now(),
            usage_count=usage,
            keep_local=keep,
            selected_context="general" if pinned else None,
        )

    def _cap_gb(self, cap_bytes: int) -> mock.patch:
        # The real cap is whole GiB; expose it at byte granularity so the test
        # fixtures stay tiny.
        return mock.patch("apps.media.services.assets.max_gb", return_value=cap_bytes / 1024**3)

    def test_defaults_to_unlimited(self) -> None:
        self.assertEqual(max_gb(), 0)
        summary = mirrored_usage()
        self.assertEqual(summary["count"], 0)
        self.assertEqual(summary["bytes"], 0)
        self.assertEqual(summary["max_gb"], 0)
        self.assertFalse(summary["over_budget"])

    def test_serving_a_mirrored_file_bumps_usage(self) -> None:
        asset = self._seed_local("budget-use.png", 16)
        self.assertEqual(asset.usage_count, 0)
        self.client.get("/api/v1/assets/budget-use.png")
        self.client.get("/api/v1/assets/budget-use.png")
        asset.refresh_from_db()
        self.assertEqual(asset.usage_count, 2)
        self.assertIsNotNone(asset.last_used_at)

    def test_overflow_evicts_least_used_and_keeps_protected(self) -> None:
        keep = self._seed_local("budget-keep.png", 300, usage=5, keep=True)
        pinned = self._seed_local("budget-pin.png", 300, usage=2, pinned=True)
        unused = self._seed_local("budget-unused.png", 300, usage=0)
        used3 = self._seed_local("budget-used3.png", 300, usage=3)
        target = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="http://img.example/new.png",
            score=50,
        )
        with (
            self._cap_gb(1100),
            mock.patch("httpx.Client", return_value=_FakeClient(_FakeResponse(b"x" * 100))),
        ):
            written = download_asset(target)

        self.assertEqual(written, 100)
        target.refresh_from_db()
        self.assertIsNotNone(target.local_name)
        self.assertTrue((asset_dir() / target.local_name).exists())
        unused.refresh_from_db()
        self.assertIsNone(unused.local_name)
        self.assertFalse((asset_dir() / "budget-unused.png").exists())
        for protected in (keep, pinned, used3):
            protected.refresh_from_db()
            self.assertIsNotNone(protected.local_name)

    def test_overflow_skips_when_only_protected_remain(self) -> None:
        self._seed_local("budget-prot-a.png", 2000, keep=True)
        self._seed_local("budget-prot-b.png", 2000, pinned=True)
        target = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="poster",
            url="http://img.example/new2.png",
            score=50,
        )
        with (
            self._cap_gb(1100),
            mock.patch("httpx.Client", return_value=_FakeClient(_FakeResponse(b"x" * 100))),
        ):
            written = download_asset(target)

        self.assertIsNone(written)
        target.refresh_from_db()
        self.assertIsNone(target.local_name)

    def test_zero_budget_never_evicts(self) -> None:
        first = self._seed_local("budget-zero-a.png", 300)
        second = self._seed_local("budget-zero-b.png", 300)
        target = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="poster",
            url="http://img.example/new3.png",
            score=50,
        )
        with (
            mock.patch("apps.media.services.assets.max_gb", return_value=0),
            mock.patch("httpx.Client", return_value=_FakeClient(_FakeResponse(b"y" * 200))),
        ):
            written = download_asset(target)

        self.assertEqual(written, 200)
        target.refresh_from_db()
        self.assertIsNotNone(target.local_name)
        for asset in (first, second):
            asset.refresh_from_db()
            self.assertIsNotNone(asset.local_name)


class ArtworkBudgetEndpointTests(AssetTestCase):
    url = "/api/v1/media/admin/artwork-settings"

    def test_get_reports_budget_and_mirror_usage(self) -> None:
        response = self.staff_client.get(self.url)
        self.assertEqual(response.status_code, 200)
        mirrored = response.data["mirrored"]
        self.assertEqual(mirrored["max_gb"], 0)
        self.assertFalse(mirrored["over_budget"])
        self.assertIn("bytes", mirrored)
        self.assertIn("count", mirrored)

    def test_put_sets_max_gb(self) -> None:
        response = self.staff_client.put(self.url, {"max_gb": 3}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(max_gb(), 3)
        self.assertEqual(response.data["mirrored"]["max_gb"], 3)
