import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from otix_server.config import AppConfig, SavesConfig, ServerSettings
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


class ScanFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_invalid_grant_deletes_secrets(self):
        from otix_server.epic import complete_scan

        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")

        def request(method, url, **kwargs):
            return 400, {"error": "invalid_grant"}

        with self.assertRaises(EpicAuthError) as ctx:
            complete_scan(self.dir, request=request)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Reconnect Epic")
        self.assertEqual(status_payload(self.dir)["connected"], False)
        self.assertIsNone(read_secrets(self.dir))

    def test_server_error_keeps_secrets(self):
        from otix_server.epic import complete_scan

        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")

        def request(method, url, **kwargs):
            return 500, {}

        with self.assertRaises(EpicAuthError) as ctx:
            complete_scan(self.dir, request=request)
        self.assertEqual(ctx.exception.status_code, 500)
        self.assertNotEqual(ctx.exception.detail, "Reconnect Epic")
        self.assertEqual(status_payload(self.dir)["connected"], True)
        self.assertEqual(read_secrets(self.dir)["refresh_token"], "secret-rt")

    def test_unlinked_raises_no_account(self):
        from otix_server.epic import complete_scan

        with self.assertRaises(EpicAuthError) as ctx:
            complete_scan(self.dir, request=lambda *args, **kwargs: (200, {}))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "No Epic account linked")

    def test_rotated_refresh_token_persisted(self):
        from otix_server.epic import complete_scan

        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="old-rt")

        def request(method, url, **kwargs):
            if "oauth/token" in url:
                return 200, {"access_token": "at", "refresh_token": "new-rt"}
            return 200, {
                "records": [
                    {
                        "appName": "Jaguar",
                        "namespace": "fn",
                        "sandboxName": "Rocket League",
                        "catalogItemId": "c1",
                        "offerId": "o1",
                    }
                ]
            }

        games = complete_scan(self.dir, request=request)
        self.assertEqual(games, [
            {
                "app_name": "Jaguar",
                "namespace": "fn",
                "catalog_item_id": "c1",
                "offer_id": "o1",
                "title": "Rocket League",
            }
        ])
        self.assertEqual(read_secrets(self.dir)["refresh_token"], "new-rt")


class EpicRouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        cfg = AppConfig(
            server=ServerSettings(auth_token="test-token"),
            saves=SavesConfig(storage_path=str(self.dir / "saves")),
        )
        self.cfg_patch = patch("otix_server.api.get_app_config", return_value=cfg)
        self.cfg_patch.start()
        from otix_server.api import app

        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer test-token"}

    def tearDown(self):
        self.cfg_patch.stop()
        self.tmp.cleanup()

    def test_status_omits_refresh_token(self):
        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")
        response = self.client.get("/api/v1/epic/status", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body, {"connected": True, "account_id": "acc", "display_name": "Diogo"})
        self.assertNotIn("refresh_token", body)
        self.assertNotIn("secret-rt", response.text)

    def test_auth_writes_secrets_and_omits_refresh_token(self):
        exchanged = {
            "account_id": "acc",
            "display_name": "Diogo",
            "refresh_token": "secret-rt",
        }
        with patch("otix_server.api.exchange_code", return_value=exchanged, create=True):
            response = self.client.post(
                "/api/v1/epic/auth",
                headers=self.headers,
                json={"code": "abc123"},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body, {"connected": True, "account_id": "acc", "display_name": "Diogo"})
        self.assertNotIn("refresh_token", body)
        self.assertNotIn("secret-rt", response.text)
        self.assertEqual(read_secrets(self.dir)["refresh_token"], "secret-rt")

    def test_disconnect_omits_refresh_token(self):
        write_secrets(self.dir, account_id="acc", display_name="Diogo", refresh_token="secret-rt")
        response = self.client.delete("/api/v1/epic/auth", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body, {"connected": False, "account_id": None, "display_name": None})
        self.assertNotIn("refresh_token", body)
        self.assertEqual(status_payload(self.dir)["connected"], False)

    def test_scan_omits_refresh_token(self):
        games = [
            {
                "app_name": "Jaguar",
                "namespace": "fn",
                "catalog_item_id": "c1",
                "offer_id": "o1",
                "title": "Rocket League",
            }
        ]
        with patch("otix_server.api.complete_scan", return_value=games, create=True):
            response = self.client.post("/api/v1/epic/scan", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body, {"games": games})
        self.assertNotIn("refresh_token", body)
        self.assertNotIn("secret-rt", response.text)

    def test_scan_maps_reconnect_error(self):
        with patch(
            "otix_server.api.complete_scan",
            side_effect=EpicAuthError(400, "Reconnect Epic"),
            create=True,
        ):
            response = self.client.post("/api/v1/epic/scan", headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "Reconnect Epic"})
        self.assertNotIn("refresh_token", response.json())
