import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from otix_server.epic import (
    EpicAuthError,
    delete_secrets,
    normalize_games,
    parse_authorization_code,
    read_secrets,
    refresh_access,
    status_payload,
    write_secrets,
)


class ParseCodeTests(unittest.TestCase):
    def test_raw_code(self):
        self.assertEqual(parse_authorization_code("  abc123  "), "abc123")

    def test_json_body(self):
        raw = json.dumps({"authorizationCode": "xyz", "sid": None})
        self.assertEqual(parse_authorization_code(raw), "xyz")

    def test_empty_raises(self):
        with self.assertRaises(EpicAuthError) as ctx:
            parse_authorization_code("   ")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "No authorization code provided")


class SecretsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_status_hides_token(self):
        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")
        payload = status_payload(self.dir)
        self.assertEqual(payload, {"connected": True, "account_id": "acc", "display_name": "Diogo"})
        self.assertNotIn("refresh_token", payload)
        self.assertEqual(read_secrets(self.dir)["refresh_token"], "secret-rt")

    def test_delete_disconnects(self):
        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")
        delete_secrets(self.dir)
        self.assertEqual(status_payload(self.dir)["connected"], False)


class RefreshAccessTests(unittest.TestCase):
    def test_invalid_grant_reconnects(self):
        def request(method, url, **kwargs):
            return 400, {"error": "invalid_grant"}

        with self.assertRaises(EpicAuthError) as ctx:
            refresh_access("rt", request=request)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Reconnect Epic")

    def test_server_error_does_not_reconnect(self):
        def request(method, url, **kwargs):
            return 500, {}

        with self.assertRaises(EpicAuthError) as ctx:
            refresh_access("rt", request=request)
        self.assertEqual(ctx.exception.status_code, 500)
        self.assertNotEqual(ctx.exception.detail, "Reconnect Epic")

    def test_missing_tokens_does_not_reconnect(self):
        def request(method, url, **kwargs):
            return 200, {"access_token": "at"}

        with self.assertRaises(EpicAuthError) as ctx:
            refresh_access("rt", request=request)
        self.assertEqual(ctx.exception.status_code, 500)
        self.assertNotEqual(ctx.exception.detail, "Reconnect Epic")


class NormalizeTests(unittest.TestCase):
    def test_skips_unreal_and_dedups(self):
        records = [
            {"appName": "UE_Foo", "namespace": "ue"},
            {"appName": "Jaguar", "namespace": "fn", "sandboxName": "Rocket League", "catalogItemId": "c1", "offerId": "o1"},
            {"appName": "Jaguar", "namespace": "fn", "sandboxName": "Rocket League dupe"},
        ]
        games = normalize_games(records)
        self.assertEqual(len(games), 1)
        self.assertEqual(games[0]["app_name"], "Jaguar")
        self.assertEqual(games[0]["title"], "Rocket League")
