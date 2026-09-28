"""Tests for VAPID key resolution (env → persisted → auto-generate)."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase

from apps.push.services import vapid as vapid_mod


class VapidKeyResolutionTests(SimpleTestCase):
    def setUp(self) -> None:
        vapid_mod.clear_vapid_cache()
        self.data_dir = Path(tempfile.mkdtemp(prefix="otix-vapid-"))

    def tearDown(self) -> None:
        vapid_mod.clear_vapid_cache()

    def test_env_keypair_wins(self) -> None:
        with mock.patch.dict(
            "os.environ",
            {"VAPID_PUBLIC_KEY": "env-pub", "VAPID_PRIVATE_KEY": "env-priv"},
            clear=False,
        ):
            vapid_mod.clear_vapid_cache()
            self.assertEqual(vapid_mod.get_vapid_public_key(), "env-pub")
            self.assertEqual(vapid_mod.get_vapid_private_key(), "env-priv")

    def test_persisted_keypair_used_when_env_unset(self) -> None:
        (self.data_dir / "vapid-keys.json").write_text(
            json.dumps({"public_key": "file-pub", "private_key": "file-priv"})
        )
        with (
            mock.patch.object(vapid_mod, "_env_keypair", return_value=None),
            mock.patch.object(vapid_mod, "_data_dir", return_value=self.data_dir),
        ):
            vapid_mod.clear_vapid_cache()
            self.assertEqual(vapid_mod.get_vapid_public_key(), "file-pub")
            self.assertEqual(vapid_mod.get_vapid_private_key(), "file-priv")

    def test_auto_generates_valid_application_server_key(self) -> None:
        with (
            mock.patch.object(vapid_mod, "_env_keypair", return_value=None),
            mock.patch.object(vapid_mod, "_data_dir", return_value=self.data_dir),
        ):
            vapid_mod.clear_vapid_cache()
            public = vapid_mod.get_vapid_public_key()
            private = vapid_mod.get_vapid_private_key()

        self.assertTrue(public)
        self.assertTrue(private)
        self.assertNotEqual(public, "dev-placeholder-vapid-public-key")
        # Uncompressed P-256 point is 65 bytes → ~87 chars url-safe base64.
        self.assertGreaterEqual(len(public), 80)
        saved = json.loads((self.data_dir / "vapid-keys.json").read_text())
        self.assertEqual(saved["public_key"], public)
        self.assertEqual(saved["private_key"], private)
