"""Tests for installer title extraction from filenames and folder paths."""

import unittest
from pathlib import Path

from otix_server.utils import (
    folder_titles_from_path,
    is_generic_installer_name,
    relative_library_path,
    title_from_installer_path,
)


class InstallerPathTitleTests(unittest.TestCase):
    def test_setup_exe_uses_parent_folder(self):
        title = title_from_installer_path(
            "setup.exe",
            "/Volumes/Games/Cyberpunk 2077/setup.exe",
            "/Volumes/Games",
        )
        self.assertEqual(title, "Cyberpunk 2077")

    def test_setup_exe_skips_generic_install_folder(self):
        title = title_from_installer_path(
            "setup.exe",
            "/Games/Hollow Knight Silksong/install/setup.exe",
            "/Games",
        )
        self.assertEqual(title, "Hollow Knight Silksong")

    def test_scene_folder_strips_repack_tag(self):
        title = title_from_installer_path(
            "setup.exe",
            "/Games/ElAmigos/Cyberpunk.2077-ElAmigos/setup.exe",
            "/Games",
        )
        self.assertEqual(title, "Cyberpunk 2077")

    def test_named_exe_keeps_filename_title(self):
        title = title_from_installer_path(
            "Portal.exe",
            "/Games/Portal/Portal.exe",
            "/Games",
        )
        self.assertEqual(title, "Portal")

    def test_relative_library_path_is_short(self):
        rel = relative_library_path(
            "/Volumes/Games/Cyberpunk 2077/setup.exe",
            "/Volumes/Games",
        )
        self.assertEqual(rel, "Cyberpunk 2077/setup.exe")

    def test_folder_titles_nearest_first(self):
        titles = folder_titles_from_path("ElAmigos/Cyberpunk.2077-ElAmigos/setup.exe")
        self.assertEqual(titles[0], "Cyberpunk 2077")

    def test_generic_installer_detection(self):
        self.assertTrue(is_generic_installer_name("setup.exe"))
        self.assertTrue(is_generic_installer_name("Install.exe"))
        self.assertFalse(is_generic_installer_name("Portal.exe"))
        self.assertFalse(is_generic_installer_name(str(Path("Half.Life.2.iso"))))


if __name__ == "__main__":
    unittest.main()
