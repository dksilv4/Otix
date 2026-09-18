"""Explorer listings include libraries that live outside the node working tree."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from otix_server.explorer_utils import external_library_roots, inspect_directory


class ExternalLibraryRootsTests(unittest.TestCase):
    def test_promotes_outside_libraries_to_top_level_folders(self):
        with TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            games = Path(tmp) / "games"
            server = Path(tmp) / "server"
            (app / "storage" / "installers").mkdir(parents=True)
            (server / "Games").mkdir(parents=True)
            (server / "Downloads").mkdir()
            games.mkdir()

            roots = external_library_roots(
                [
                    str(app / "storage" / "installers"),
                    str(games),
                    str(server / "Games"),
                    str(server / "Downloads"),
                ],
                app,
            )

            self.assertEqual(sorted(roots), sorted([games.resolve(), server.resolve()]))

    def test_skips_missing_and_in_tree_paths(self):
        with TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            (app / "storage").mkdir(parents=True)
            roots = external_library_roots(
                [str(app / "storage"), str(Path(tmp) / "nope")],
                app,
            )
            self.assertEqual(roots, [])


class InspectDirectoryExternalRootsTests(unittest.TestCase):
    def test_server_root_lists_external_libraries_as_folders(self):
        with TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            games = Path(tmp) / "games"
            (app / "storage").mkdir(parents=True)
            games.mkdir()

            result = inspect_directory(
                app,
                server_root=app,
                extra_library_paths=[str(games)],
            )

            names = [entry.name for entry in result.entries if entry.is_dir]
            self.assertIn("storage", names)
            self.assertIn("games", names)
            games_entry = next(entry for entry in result.entries if entry.name == "games")
            self.assertEqual(Path(games_entry.path).resolve(), games.resolve())

    def test_nested_folder_does_not_repeat_external_libraries(self):
        with TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            games = Path(tmp) / "games"
            nested = app / "storage"
            nested.mkdir(parents=True)
            games.mkdir()

            result = inspect_directory(
                nested,
                server_root=app,
                extra_library_paths=[str(games)],
            )

            self.assertNotIn("games", [entry.name for entry in result.entries])


if __name__ == "__main__":
    unittest.main()
