"""Tests for library file indexing."""

import tempfile
import unittest
from pathlib import Path

from otix_server.indexer import StorageIndexer


class StorageIndexerTests(unittest.TestCase):
    def test_scan_skips_bin_files_even_when_extension_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Portal.exe").write_bytes(b"exe")
            (root / "Portal.bin").write_bytes(b"bin")
            (root / "Track 01.bin").write_bytes(b"cue")

            indexer = StorageIndexer(
                [
                    {
                        "name": "Games",
                        "path": str(root),
                        "allowed_extensions": [".exe", ".bin", ".iso"],
                    }
                ]
            )
            files = indexer.scan_all()
            names = {item.filename for item in files}

            self.assertEqual(names, {"Portal.exe"})
            self.assertTrue(all(item.extension != ".bin" for item in indexer.files_by_id.values()))

    def test_rescan_drops_stale_files_by_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Game.iso").write_bytes(b"iso")
            indexer = StorageIndexer(
                [{"name": "Games", "path": str(root), "allowed_extensions": [".iso"]}]
            )
            first = indexer.scan_all()
            self.assertEqual([item.filename for item in first], ["Game.iso"])
            indexer.files_by_id["stale"] = first[0]
            files = indexer.scan_all()
            self.assertEqual([item.filename for item in files], ["Game.iso"])
            self.assertNotIn("stale", indexer.files_by_id)


if __name__ == "__main__":
    unittest.main()
