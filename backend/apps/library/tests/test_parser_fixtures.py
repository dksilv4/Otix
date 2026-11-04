"""Test cross-language parser parity against the shared fixtures suite."""

import json
from pathlib import Path
from unittest import TestCase

try:
    from apps.library.services.server_catalog import parse_release_name
except (ImportError, ModuleNotFoundError):
    import importlib.util
    import sys
    server_catalog_path = Path(__file__).resolve().parent.parent / "services" / "server_catalog.py"
    spec = importlib.util.spec_from_file_location("server_catalog", server_catalog_path)
    server_catalog = importlib.util.module_from_spec(spec)
    sys.modules["server_catalog"] = server_catalog
    spec.loader.exec_module(server_catalog)
    parse_release_name = server_catalog.parse_release_name


class ParserFixturesParityTestCase(TestCase):
    def test_all_fixtures_parity(self):
        candidates = [
            Path("/app/fixtures/parser_fixtures.json"),
            Path(__file__).resolve().parent.parent.parent.parent / "fixtures" / "parser_fixtures.json",
            Path(__file__).resolve().parent.parent.parent.parent.parent / "fixtures" / "parser_fixtures.json",
        ]
        fixture_path = next((p for p in candidates if p.exists()), None)
        self.assertIsNotNone(fixture_path, "parser_fixtures.json must exist")

        data = json.loads(fixture_path.read_text(encoding="utf-8"))
        cases = data.get("cases", [])
        self.assertGreaterEqual(len(cases), 105, "Must have at least 105 test cases")

        for i, tc in enumerate(cases):
            res = parse_release_name(tc["input"], tc.get("ext_hint", ""), tc.get("parent_dir", ""))
            exp = tc["expected"]
            self.assertEqual(res.title, exp["title"], f"Case {i}: {tc['input']} title mismatch")
            self.assertEqual(res.clean_title, exp["clean_title"], f"Case {i}: {tc['input']} clean_title mismatch")
            self.assertEqual(res.platform, exp["platform"], f"Case {i}: {tc['input']} platform mismatch")
            self.assertEqual(res.release_group, exp.get("release_group", ""), f"Case {i}: {tc['input']} release_group mismatch")
            self.assertEqual(res.year, exp.get("year", ""), f"Case {i}: {tc['input']} year mismatch")
            self.assertEqual(res.version, exp.get("version", ""), f"Case {i}: {tc['input']} version mismatch")
            self.assertEqual(res.region, exp.get("region", ""), f"Case {i}: {tc['input']} region mismatch")
            self.assertEqual(res.title_id, exp.get("title_id", ""), f"Case {i}: {tc['input']} title_id mismatch")
            self.assertEqual(res.is_scene, exp.get("is_scene", False), f"Case {i}: {tc['input']} is_scene mismatch")
