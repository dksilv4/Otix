"""Endpoint tests for the Google-Drive cloud-save proxy routes.

Covers the four ``/saves`` cloud handlers (files/upload/download/delete),
mirroring legacy ``saves.py``: a user without a Drive link (or whose refresh
was revoked) gets the not-linked 401; the Drive client's typed upstream
errors are replayed verbatim; network transport failures become the per-route
500 detail. The Drive ``_request`` leaf and the accounts OAuth ``_request``
leaf are the two mocked seams (no real network).
"""

from __future__ import annotations

import json
import urllib.error
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.track.services.cloud_saves import DRIVE_NOT_LINKED
from apps.track.services.google_drive import DriveRequestError

User = get_user_model()

FILES = [
    {
        "id": "fileA",
        "name": "root/slot1.bin",
        "mimeType": "application/octet-stream",
        "md5Checksum": "abc123",
        "modifiedTime": "2026-01-01T00:00:00.000Z",
        "size": "1234",
    }
]
DOWNLOAD_BYTES = b"SAVE-BINARY-CONTENT"

OAUTH = "apps.accounts.services.oauth._request"
DRIVE = "apps.track.services.google_drive._request"


class CloudSaveApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.user.drive_access_token = "cached_at"
        self.user.drive_refresh_token = "drive_rt"
        self.user.drive_token_expires_at = timezone.now() + timedelta(hours=1)
        self.user.save(
            update_fields=("drive_access_token", "drive_refresh_token", "drive_token_expires_at")
        )
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.anon = APIClient()

    # ── the Drive _request seam ─────────────────────────────────────────

    def _drive_fake(self, created_names):
        def fake(method, url, access_token, *, params=None, headers=None, content=None):
            if method == "DELETE":
                return 200, b""
            fields = (params or {}).get("fields", "")
            if method == "GET":
                if params is None:
                    return 200, DOWNLOAD_BYTES
                if "md5Checksum" in fields:
                    return 200, json.dumps({"files": list(FILES)}).encode()
                return 200, json.dumps({"files": []}).encode()
            if method == "PATCH":
                return 200, json.dumps({"id": "drive_existing_file", "name": "slot1.bin"}).encode()
            if "/upload/" in url:
                return 200, json.dumps({"id": "drive_new_file", "name": "slot1.bin"}).encode()
            meta = json.loads(content.decode("utf-8"))
            created_names.append(meta["name"])
            return 200, json.dumps({"id": f"fld:{meta['name']}"}).encode()

        return fake

    def _refresh_fake(self, body):
        def fake(url, *, method="GET", form=None, data=None, headers=None, timeout=15.0):
            return 200, json.dumps(body)

        return fake

    # ── files ───────────────────────────────────────────────────────────

    def test_files_lists_recursively(self) -> None:
        created: list[str] = []
        with mock.patch(DRIVE, side_effect=self._drive_fake(created)):
            response = self.client.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, FILES)
        self.assertEqual(created, ["Otix Game Saves", "12345", "default"])

    def test_files_honors_profile_query(self) -> None:
        created: list[str] = []
        with mock.patch(DRIVE, side_effect=self._drive_fake(created)):
            response = self.client.get("/api/v1/saves/12345/files?profile_id=profile2")
        self.assertEqual(response.status_code, 200)
        self.assertIn("profile2", created)

    def test_files_401_when_no_drive_link(self) -> None:
        plain = User.objects.create_user(username="bob", password="pw")
        token = Token.objects.create(user=plain)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        with mock.patch(DRIVE) as drive_mock:
            response = client.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], DRIVE_NOT_LINKED)
        drive_mock.assert_not_called()

    def test_files_refreshes_expired_token(self) -> None:
        self.user.drive_token_expires_at = timezone.now() - timedelta(seconds=30)
        self.user.save(update_fields=("drive_token_expires_at",))
        created: list[str] = []
        with (
            mock.patch(
                OAUTH,
                side_effect=self._refresh_fake(
                    {"access_token": "refreshed_at", "expires_in": 3600}
                ),
            ),
            mock.patch(DRIVE, side_effect=self._drive_fake(created)),
        ):
            response = self.client.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.drive_access_token, "refreshed_at")

    def test_files_revoked_token_unlinks_and_401s(self) -> None:
        self.user.drive_token_expires_at = timezone.now() - timedelta(seconds=30)
        self.user.save(update_fields=("drive_token_expires_at",))
        with mock.patch(OAUTH) as oauth_mock:
            oauth_mock.return_value = (400, json.dumps({"error": "invalid_grant"}))
            response = self.client.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], DRIVE_NOT_LINKED)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.drive_refresh_token)

    def test_files_replays_upstream_502(self) -> None:
        def bad_fake(method, url, access_token, *, params=None, headers=None, content=None):
            raise DriveRequestError(502, "Google Drive API error: upstream blew up")

        with mock.patch(DRIVE, side_effect=bad_fake):
            response = self.client.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "Google Drive API error: upstream blew up")

    def test_files_network_failure_500(self) -> None:
        with mock.patch(DRIVE, side_effect=urllib.error.URLError("down")):
            response = self.client.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Failed to retrieve file list from Google Drive.")

    def test_files_requires_auth(self) -> None:
        response = self.anon.get("/api/v1/saves/12345/files")
        self.assertEqual(response.status_code, 401)

    # ── upload ──────────────────────────────────────────────────────────

    def _multipart(self):
        return {"file": SimpleUploadedFile("slot1.bin", b"BINARY-SAVE-DATA")}

    def test_upload_creates_nested_folder_and_file(self) -> None:
        created: list[str] = []
        with mock.patch(DRIVE, side_effect=self._drive_fake(created)):
            response = self.client.post(
                "/api/v1/saves/12345/upload?filename=Saves/slot1.bin&profile_id=default",
                self._multipart(),
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], "drive_new_file")
        self.assertEqual(created, ["Otix Game Saves", "12345", "default", "Saves"])

    def test_upload_overwrites_when_file_id_given(self) -> None:
        with mock.patch(DRIVE, side_effect=self._drive_fake([])):
            response = self.client.post(
                "/api/v1/saves/12345/upload?filename=save.bin&file_id=existing_id",
                self._multipart(),
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], "drive_existing_file")

    def test_upload_missing_filename_400(self) -> None:
        response = self.client.post(
            "/api/v1/saves/12345/upload", self._multipart(), format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "filename query parameter is required.")

    def test_upload_missing_file_400(self) -> None:
        response = self.client.post(
            "/api/v1/saves/12345/upload?filename=save.bin",
            {},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Upload file is required.")

    def test_upload_network_failure_500(self) -> None:
        def bad_fake(method, url, access_token, *, params=None, headers=None, content=None):
            if method == "GET":
                return 200, json.dumps({"files": []}).encode()
            if "/upload/" in url:
                raise urllib.error.URLError("down")
            meta = json.loads(content.decode("utf-8"))
            return 200, json.dumps({"id": f"fld:{meta['name']}"}).encode()

        with mock.patch(DRIVE, side_effect=bad_fake):
            response = self.client.post(
                "/api/v1/saves/12345/upload?filename=save.bin",
                self._multipart(),
                format="multipart",
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Failed to upload file to Google Drive.")

    # ── download ────────────────────────────────────────────────────────

    def test_download_returns_binary_content(self) -> None:
        with mock.patch(DRIVE, side_effect=self._drive_fake([])):
            response = self.client.get("/api/v1/saves/12345/download/file_123")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, DOWNLOAD_BYTES)
        self.assertEqual(response["Content-Disposition"], "attachment; filename=file_123")
        self.assertEqual(response["Content-Type"], "application/octet-stream")

    def test_download_network_failure_500(self) -> None:
        with mock.patch(DRIVE, side_effect=urllib.error.URLError("down")):
            response = self.client.get("/api/v1/saves/12345/download/file_123")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Failed to download file from Google Drive.")

    # ── delete ──────────────────────────────────────────────────────────

    def test_delete_returns_success(self) -> None:
        with mock.patch(DRIVE, side_effect=self._drive_fake([])) as drive_mock:
            response = self.client.delete("/api/v1/saves/12345/delete/file_123")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "success"})
        self.assertEqual(drive_mock.call_args.args[0], "DELETE")

    def test_delete_network_failure_500(self) -> None:
        with mock.patch(DRIVE, side_effect=urllib.error.URLError("down")):
            response = self.client.delete("/api/v1/saves/12345/delete/file_123")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Failed to delete file from Google Drive.")
