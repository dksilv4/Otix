from datetime import date
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from apps.media.models import ExternalID, MediaItem
from apps.media.services.steam_seed import (
    clean_scan_title,
    parse_steam_release_date,
    pick_steam_app,
    seed_game_from_steam_app,
    seed_games_from_titles,
    should_seed_title,
)


class PickSteamAppTests(SimpleTestCase):
    def test_exact_title_wins_over_dlc(self):
        items = [
            {"id": 9, "name": "Portal DLC", "type": "dlc"},
            {"id": 400, "name": "Portal", "type": "app"},
        ]
        self.assertEqual(pick_steam_app("Portal", items)["id"], 400)

    def test_trademark_numeral_title_still_matches(self):
        items = [{"id": 1282100, "name": "REMNANT II®", "type": "app"}]
        self.assertEqual(pick_steam_app("Remnant Ii", items)["id"], 1282100)

    def test_no_confident_match_returns_none(self):
        items = [{"id": 1, "name": "Unrelated Shooter", "type": "app"}]
        self.assertIsNone(pick_steam_app("Balatro", items))


class CleanScanTitleTests(SimpleTestCase):
    def test_strips_early_build_and_scene_tags(self):
        self.assertEqual(
            clean_scan_title("Hollow Knight Silksong Early Build"), "Hollow Knight Silksong"
        )
        self.assertEqual(
            clean_scan_title("High On Life High On Knife Razor1911"), "High On Life High On Knife"
        )
        self.assertEqual(clean_scan_title("Lords Of The Fallen 2023"), "Lords Of The Fallen")
        self.assertEqual(
            clean_scan_title("Marvels Spiderman Miles Morales"), "Marvels spider man Miles Morales"
        )

    def test_skips_installers_and_redists(self):
        self.assertFalse(should_seed_title("setup"))
        self.assertFalse(should_seed_title("Vc Redist"))
        self.assertTrue(should_seed_title("Hollow Knight Silksong Early Build"))


class ParseSteamDateTests(SimpleTestCase):
    def test_parses_common_store_date(self):
        self.assertEqual(parse_steam_release_date("20 Feb, 2024"), date(2024, 2, 20))

    def test_ignores_coming_soon(self):
        self.assertIsNone(parse_steam_release_date("Coming soon"))


class SeedGamesFromTitlesTests(TestCase):
    def test_skips_titles_already_in_catalog(self):
        MediaItem.objects.create(media_type="game", title="Balatro", slug="balatro")
        with patch("apps.media.services.steam_seed.search_steam_store") as search:
            result = seed_games_from_titles(["Balatro"], delay=0, fetch_details=False)
        search.assert_not_called()
        self.assertEqual(result["skipped"], ["Balatro"])
        self.assertEqual(result["created"], [])

    @patch("apps.media.services.steam_seed.fetch_steam_appdetails")
    @patch("apps.media.services.steam_seed.search_steam_store")
    def test_seeds_exact_steam_hit(self, search, details):
        search.return_value = [{"id": 400, "name": "Portal", "type": "app"}]
        details.return_value = {
            "name": "Portal",
            "short_description": "The cake is a lie.",
            "release_date": {"date": "10 Oct, 2007"},
        }
        result = seed_games_from_titles(["Portal"], delay=0)
        self.assertEqual(result["created"], [])
        self.assertEqual(result["unmatched"], ["Portal"])
        self.assertEqual(MediaItem.objects.count(), 0)
        from apps.integrations.models import SyncJob

        self.assertFalse(SyncJob.objects.filter(provider="igdb").exists())

    def test_reuses_existing_steam_external_id(self):
        media = MediaItem.objects.create(media_type="game", title="Portal", slug="portal")
        from django.contrib.contenttypes.models import ContentType

        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="steam",
            external_id="400",
            media_type="game",
        )
        first = seed_game_from_steam_app("Portal", 400)
        again = seed_game_from_steam_app("Portal", 400)
        self.assertEqual(first.pk, again.pk)
        self.assertEqual(MediaItem.objects.filter(title="Portal").count(), 1)
