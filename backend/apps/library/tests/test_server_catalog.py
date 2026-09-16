from django.test import SimpleTestCase, TestCase

from apps.library.services.server_catalog import (
    _match_keys,
    is_addon_title,
    match_catalog_row,
    match_files_to_catalog,
    title_keys_for_file,
    unmatched_scan_titles,
)
from apps.media.models import MediaItem


class TitleKeysTests(SimpleTestCase):
    def test_update_filename_strips_to_parent_title(self):
        keys = title_keys_for_file(
            "Half.Life.2.Update.1-FLT.iso",
            "Half Life 2 Update 1 Flt",
        )
        self.assertIn("half life 2", keys)

    def test_addon_detection(self):
        self.assertTrue(is_addon_title("Half.Life.2.Update.1-FLT.iso", "Half Life 2 Update 1"))
        self.assertTrue(is_addon_title("Cyberpunk.2077.Phantom.Liberty.DLC-GOG.iso", None))
        self.assertFalse(is_addon_title("Half.Life.2-FLT.iso", "Half Life 2"))

    def test_hyphenated_catalog_title_matches_scene_filename(self):
        keys = title_keys_for_file("Half.Life.2.iso", "Half Life 2")
        by_key = {"half life 2": {"id": 9, "title": "Half-Life 2"}}
        self.assertEqual(match_catalog_row(keys, by_key, addon=False)["id"], 9)

    def test_early_build_and_edition_strip_to_catalog_title(self):
        keys = title_keys_for_file(
            "Hollow.Knight.Silksong.Early.Build.iso",
            "Hollow Knight Silksong Early Build",
        )
        self.assertIn("hollow knight silksong", keys)

    def test_numeral_variant_matches_catalog_title(self):
        keys = title_keys_for_file("Call.Of.Duty.Black.Ops.2.iso", "Call Of Duty Black Ops 2")
        by_key = {}
        for extra in _match_keys("Call of Duty®: Black Ops II"):
            by_key[extra] = {"id": 12, "title": "Call of Duty®: Black Ops II"}
        self.assertEqual(match_catalog_row(keys, by_key, addon=False)["id"], 12)

    def test_setup_exe_uses_parent_folder_as_match_key(self):
        keys = title_keys_for_file(
            "setup.exe",
            "Setup",
            relative_path="Cyberpunk 2077/setup.exe",
        )
        self.assertIn("cyberpunk 2077", keys)
        self.assertNotIn("setup", keys)

    def test_setup_exe_skips_generic_install_folders(self):
        keys = title_keys_for_file(
            "setup.exe",
            "Setup",
            relative_path="Hollow Knight Silksong/install/setup.exe",
        )
        self.assertIn("hollow knight silksong", keys)

    def test_named_dlc_falls_back_to_parent_catalog_key(self):
        by_key = {"cyberpunk 2077": {"id": 1, "title": "Cyberpunk 2077"}}
        keys = title_keys_for_file(
            "Cyberpunk.2077.Phantom.Liberty.DLC-GOG.iso",
            "Cyberpunk 2077 Phantom Liberty DLC",
        )
        row = match_catalog_row(keys, by_key, addon=True)
        self.assertIsNotNone(row)
        self.assertEqual(row["id"], 1)


class MatchFilesToCatalogTests(TestCase):
    def test_update_and_named_dlc_resolve_to_parent(self):
        media = MediaItem.objects.create(
            media_type="game",
            title="Cyberpunk 2077",
            slug="cyberpunk-2077",
            overview="Night City.",
        )
        files = [
            {
                "filename": "Cyberpunk.2077-GOG.iso",
                "game_title": "Cyberpunk 2077",
            },
            {
                "filename": "Cyberpunk.2077.Update.2.13-GOG.iso",
                "game_title": "Cyberpunk 2077 Update 2 13",
            },
            {
                "filename": "Cyberpunk.2077.Phantom.Liberty.DLC-GOG.iso",
                "game_title": "Cyberpunk 2077 Phantom Liberty DLC",
            },
        ]
        match_files_to_catalog(files)
        for file in files:
            self.assertIsNotNone(file["catalog_item"])
            self.assertEqual(file["catalog_item"]["id"], str(media.id))
            self.assertEqual(file["catalog_item"]["title"], "Cyberpunk 2077")

    def test_setup_exe_matches_from_relative_folder_path(self):
        media = MediaItem.objects.create(
            media_type="game",
            title="Hollow Knight Silksong",
            slug="hollow-knight-silksong",
        )
        files = [
            {
                "filename": "setup.exe",
                "game_title": "Setup",
                "relative_path": "Hollow_Knight_Silksong/setup.exe",
            }
        ]
        match_files_to_catalog(files)
        self.assertIsNotNone(files[0]["catalog_item"])
        self.assertEqual(files[0]["catalog_item"]["id"], str(media.id))


class UnmatchedScanTitlesTests(SimpleTestCase):
    def test_skips_matched_addons_and_bin_files(self):
        files = [
            {"filename": "Portal.iso", "game_title": "Portal", "catalog_item": None, "extension": ".iso"},
            {"filename": "Half.Life.2.iso", "game_title": "Half Life 2", "catalog_item": {"id": "1"}, "extension": ".iso"},
            {"filename": "track.bin", "game_title": "Cue Dump", "catalog_item": None, "extension": ".bin"},
            {"filename": "Portal.Update.1.iso", "game_title": "Portal Update 1", "catalog_item": None, "extension": ".iso"},
        ]
        titles = unmatched_scan_titles(files)
        self.assertEqual(titles, ["Portal"])
