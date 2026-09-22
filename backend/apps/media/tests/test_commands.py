"""Unit tests for media management commands: purge_media and analyze_asset_colors."""

import io
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from apps.media.models import Episode, ExternalID, Game, MediaAsset, MediaItem, Season, Show


class PurgeMediaCommandTests(TestCase):
    def setUp(self):
        self.item = MediaItem.objects.create(
            title="Purge Target", media_type="show", slug="purge-target"
        )
        self.show = Show.objects.create(media_item=self.item)
        self.season = Season.objects.create(show=self.show, season_number=1)
        self.episode = Episode.objects.create(season=self.season, episode_number=1)
        self.asset = MediaAsset.objects.create(
            media_item=self.item, asset_type="poster", url="https://example.com/poster.jpg"
        )
        self.ext_id = ExternalID.objects.create(
            target=self.item, provider="steam", external_id="12345"
        )

    @patch("apps.media.management.commands.purge_media.purge_downloaded_assets")
    def test_dry_run_does_not_delete(self, mock_purge_assets):
        out = io.StringIO()
        call_command("purge_media", "--dry-run", stdout=out)
        self.assertEqual(MediaItem.objects.count(), 1)
        self.assertEqual(ExternalID.objects.count(), 1)
        self.assertEqual(MediaAsset.objects.count(), 1)
        mock_purge_assets.assert_not_called()
        self.assertIn("[dry-run] Would delete", out.getvalue())

    @patch("apps.media.management.commands.purge_media.purge_downloaded_assets")
    def test_purge_deletes_all_records(self, mock_purge_assets):
        mock_purge_assets.return_value = {"deleted": 2, "bytes_freed": 1024}
        out = io.StringIO()
        call_command("purge_media", stdout=out)

        self.assertEqual(MediaItem.objects.count(), 0)
        self.assertEqual(Game.objects.count(), 0)
        self.assertEqual(Season.objects.count(), 0)
        self.assertEqual(Episode.objects.count(), 0)
        self.assertEqual(MediaAsset.objects.count(), 0)
        self.assertEqual(ExternalID.objects.count(), 0)
        mock_purge_assets.assert_called_once()
        self.assertIn("Successfully deleted all media", out.getvalue())


class AnalyzeAssetColorsCommandTests(TestCase):
    def setUp(self):
        self.item = MediaItem.objects.create(
            title="Analysis Target", media_type="game", slug="analysis-target"
        )
        self.asset = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="https://example.com/logo.png",
            color_guess=None,
        )

    @patch("apps.media.management.commands.analyze_asset_colors.analyze_image_url")
    def test_analyze_and_backfill(self, mock_analyze_url):
        mock_analyze_url.return_value = "guess_white"
        out = io.StringIO()
        call_command("analyze_asset_colors", "--limit=10", stdout=out)

        self.asset.refresh_from_db()
        self.assertEqual(self.asset.color_guess, "guess_white")
        self.assertIn("Updated 1 rows", out.getvalue())

    @patch("apps.media.management.commands.analyze_asset_colors.analyze_image_url")
    def test_dry_run_does_not_save(self, mock_analyze_url):
        mock_analyze_url.return_value = "guess_black"
        out = io.StringIO()
        call_command("analyze_asset_colors", "--dry-run", stdout=out)

        self.asset.refresh_from_db()
        self.assertIsNone(self.asset.color_guess)
        self.assertIn("Would update 0 rows", out.getvalue())
