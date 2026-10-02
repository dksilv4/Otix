"""Endpoint tests for ``POST /api/v1/upload`` (authenticated image upload).

The route validates declared content-type + filename extension against the
allowed image set, scans for polyglot web shells, script injection, and executable
headers, sniffs magic bytes, enforces the size cap, verifies structural integrity
and pixel bomb limits with Pillow, strips EXIF metadata, then writes a uuid-named
blob under ``settings.UPLOAD_DIR`` and returns the absolute ``/uploads/<name>`` URL.
Tests redirect ``UPLOAD_DIR`` to a temp dir so no files land in the repo.
"""

import base64
import io
import re
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

User = get_user_model()

URL = "/api/v1/upload"

# Real, minimal valid test images decoded from base64
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=="
)
JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z"
)
GIF = base64.b64decode("R0lGODdhAgACAIEAAP8AAAAAAAAAAAAAACwAAAAAAgACAAAIBgABCAQQEAA7")
WEBP = base64.b64decode("UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=")

_NAME_RE = re.compile(r"^http://testserver/uploads/[0-9a-f]{32}\.png$")


class UploadTestCase(TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._dir_override = override_settings(UPLOAD_DIR=str(self.tmp))
        self._dir_override.enable()
        self.addCleanup(self._dir_override.disable)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.user = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def post(self, name="avatar.png", ct="image/png", body=PNG):
        return self.client.post(URL, {"file": _file(name, body, ct)}, format="multipart")

    def files(self):
        return list(self.tmp.iterdir())


def _file(name, body, ct):
    return SimpleUploadedFile(name, body, content_type=ct)


class UploadAuthTests(UploadTestCase):
    def test_unauthenticated_401(self):
        resp = APIClient().post(URL, {"file": _file("a.png", PNG, "image/png")}, format="multipart")
        self.assertEqual(resp.status_code, 401)

    def test_missing_field_400(self):
        resp = self.client.post(URL, {}, format="multipart")
        self.assertEqual(resp.status_code, 400)


class UploadHappyPathTests(UploadTestCase):
    def test_uploads_png(self):
        resp = self.post()
        self.assertEqual(resp.status_code, 201)
        self.assertRegex(resp.json()["url"], _NAME_RE)
        written = self.files()
        self.assertEqual(len(written), 1)
        self.assertTrue(written[0].read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))

    def test_uploads_jpeg(self):
        resp = self.post(name="photo.jpg", ct="image/jpeg", body=JPEG)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(self.files()), 1)
        self.assertTrue(self.files()[0].read_bytes().startswith(b"\xff\xd8\xff"))

    def test_uploads_gif(self):
        resp = self.post(name="anim.gif", ct="image/gif", body=GIF)
        self.assertEqual(resp.status_code, 201)

    def test_uploads_webp(self):
        resp = self.post(name="img.webp", ct="image/webp", body=WEBP)
        self.assertEqual(resp.status_code, 201)

    def test_accepts_jpg_extension_variant(self):
        resp = self.post(name="photo.jpeg", ct="image/jpeg", body=JPEG)
        self.assertEqual(resp.status_code, 201)

    def test_forwards_proto_header_in_url(self):
        resp = self.client.post(
            URL,
            {"file": _file("avatar.png", PNG, "image/png")},
            format="multipart",
            HTTP_X_FORWARDED_PROTO="https",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.json()["url"].startswith("https://testserver/uploads/"))


class UploadRejectionTests(UploadTestCase):
    def test_unsupported_content_type_400(self):
        resp = self.post(ct="image/svg+xml")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Unsupported file type", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_unsupported_extension_400(self):
        resp = self.post(name="avatar.txt")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Unsupported extension: .txt", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_bad_magic_bytes_400(self):
        resp = self.post(body=b"not an image at all")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "File content does not match an allowed image type")
        self.assertEqual(self.files(), [])

    def test_oversize_413(self):
        with override_settings(UPLOAD_MAX_SIZE_MB=0):
            resp = self.post(body=b"x" * 10)
        self.assertEqual(resp.status_code, 413)
        self.assertEqual(resp.json()["detail"], "File too large. Max 0MB")
        self.assertEqual(self.files(), [])

    def test_rejection_of_riff_wave(self):
        wave_body = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 4
        resp = self.post(name="fake.webp", ct="image/webp", body=wave_body)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.files(), [])


class UploadSecurityTests(UploadTestCase):
    """Rigorous malware prevention, polyglot rejection, and security headers tests."""

    def test_rejects_embedded_php_web_shell(self):
        payload = b"GIF89a" + b"<?php system($_GET['cmd']); ?>"
        resp = self.post(name="shell.gif", ct="image/gif", body=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("malicious", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_rejects_embedded_script_tag(self):
        payload = PNG + b"<script>alert('xss')</script>"
        resp = self.post(name="xss.png", ct="image/png", body=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("malicious", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_rejects_executable_mz_header(self):
        payload = b"MZ\x90\x00\x03\x00\x00\x00"
        resp = self.post(name="malware.png", ct="image/png", body=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("executable header detected", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_rejects_executable_elf_header(self):
        payload = b"\x7fELF\x02\x01\x01\x00"
        resp = self.post(name="binary.png", ct="image/png", body=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("executable header detected", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_rejects_archive_pk_header(self):
        payload = b"PK\x03\x04\x14\x00\x00\x00"
        resp = self.post(name="archive.png", ct="image/png", body=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("archive container header detected", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_rejects_decompression_bomb_dimensions(self):
        # Create an oversized 5000x5000 test image (exceeds MAX_IMAGE_DIMENSION 4096)
        buf = io.BytesIO()
        Image.new("RGB", (5000, 5000)).save(buf, format="PNG")
        oversized = buf.getvalue()
        resp = self.post(name="huge.png", ct="image/png", body=oversized)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("dimensions too large", resp.json()["detail"])
        self.assertEqual(self.files(), [])

    def test_serving_security_headers(self):
        resp = self.post(name="avatar.png", ct="image/png", body=PNG)
        self.assertEqual(resp.status_code, 201)
        url = resp.json()["url"]
        filename = url.rsplit("/", 1)[-1]

        anon_client = APIClient()
        get_resp = anon_client.get(f"/uploads/{filename}")
        self.assertEqual(get_resp.status_code, 200)

        # Assert defensive security headers
        self.assertEqual(get_resp.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("sandbox", get_resp.headers["Content-Security-Policy"])
        self.assertEqual(get_resp.headers["X-Frame-Options"], "DENY")
        self.assertEqual(get_resp.headers["Cross-Origin-Resource-Policy"], "cross-origin")

    def test_rejects_invalid_filename_pattern(self):
        anon_client = APIClient()
        # Invalid characters or non-hex length must 404
        self.assertEqual(anon_client.get("/uploads/not-a-valid-uuid.png").status_code, 404)
        self.assertEqual(anon_client.get("/uploads/../../etc/passwd").status_code, 404)

    def test_avatar_url_validation_blocks_javascript(self):
        resp = self.client.patch(
            "/api/v1/auth/me",
            {"avatar_url": "javascript:alert(document.cookie)"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("avatar_url", resp.json())

    def test_avatar_url_validation_blocks_data_uri(self):
        resp = self.client.patch(
            "/api/v1/auth/me",
            {"avatar_url": "data:text/html,<script>alert(1)</script>"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("avatar_url", resp.json())

    def test_avatar_url_validation_accepts_valid_url(self):
        resp = self.client.patch(
            "/api/v1/auth/me",
            {"avatar_url": "https://example.com/avatar.png"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["avatar_url"], "https://example.com/avatar.png")


class UploadServingTests(UploadTestCase):
    def test_serve_uploaded_file(self):
        resp = self.post(name="avatar.png", ct="image/png", body=PNG)
        self.assertEqual(resp.status_code, 201)
        url = resp.json()["url"]
        filename = url.rsplit("/", 1)[-1]

        # Public access without auth credentials
        anon_client = APIClient()
        get_resp = anon_client.get(f"/uploads/{filename}")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.headers["Content-Type"], "image/png")
        self.assertEqual(get_resp.headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertTrue(len(b"".join(get_resp.streaming_content)) > 0)

    def test_serve_via_api_v1_path(self):
        resp = self.post(name="photo.jpg", ct="image/jpeg", body=JPEG)
        self.assertEqual(resp.status_code, 201)
        filename = resp.json()["url"].rsplit("/", 1)[-1]

        anon_client = APIClient()
        get_resp = anon_client.get(f"/api/v1/uploads/{filename}")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.headers["Content-Type"], "image/jpeg")
        self.assertTrue(len(b"".join(get_resp.streaming_content)) > 0)

    def test_serve_nonexistent_file_404(self):
        anon_client = APIClient()
        get_resp = anon_client.get("/uploads/00000000000000000000000000000000.png")
        self.assertEqual(get_resp.status_code, 404)

    def test_serve_disallowed_extension_404(self):
        anon_client = APIClient()
        get_resp = anon_client.get("/uploads/passwords.txt")
        self.assertEqual(get_resp.status_code, 404)


class UploadToProfileEndToEndTests(UploadTestCase):
    def test_upload_and_set_user_avatar_and_banner(self):
        # 1. Upload avatar
        resp_avatar = self.client.post(
            URL,
            {"file": _file("my_avatar.png", PNG, "image/png")},
            format="multipart",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(resp_avatar.status_code, 201)
        avatar_url = resp_avatar.json()["url"]

        # 2. Upload cover banner
        resp_cover = self.client.post(
            URL,
            {"file": _file("my_cover.jpg", JPEG, "image/jpeg")},
            format="multipart",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(resp_cover.status_code, 201)
        cover_url = resp_cover.json()["url"]

        # 3. Update profile via PATCH /api/v1/auth/me
        patch_resp = self.client.patch(
            "/api/v1/auth/me",
            {
                "avatar_url": avatar_url,
                "background_url": cover_url,
                "bio": "Hello world with custom avatar",
            },
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)
        data = patch_resp.json()
        self.assertEqual(data["avatar_url"], avatar_url)
        self.assertEqual(data["background_url"], cover_url)

        # 4. Verify public user profile reflects the avatar & background
        anon_client = APIClient()
        pub_resp = anon_client.get(f"/api/v1/users/{self.user.username}")
        self.assertEqual(pub_resp.status_code, 200)
        pub_data = pub_resp.json()
        self.assertEqual(pub_data["avatar_url"], avatar_url)
        self.assertEqual(pub_data["background_url"], cover_url)

        # 5. Verify the avatar file itself can be downloaded via its URL path
        avatar_filename = avatar_url.rsplit("/", 1)[-1]
        file_resp = anon_client.get(f"/uploads/{avatar_filename}")
        self.assertEqual(file_resp.status_code, 200)
        self.assertTrue(len(b"".join(file_resp.streaming_content)) > 0)

    def test_uploaded_file_is_completely_renamed(self):
        original_name = "Private_User_Photo_2026.png"
        resp = self.client.post(
            URL,
            {"file": _file(original_name, PNG, "image/png")},
            format="multipart",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(resp.status_code, 201)
        url = resp.json()["url"]
        stored_name = url.rsplit("/", 1)[-1]

        # 1. Original filename must not be in URL or stored name
        self.assertNotIn("Private", stored_name)
        self.assertNotIn("Photo", stored_name)
        self.assertNotIn("2026", stored_name)

        # 2. Stored filename must be exactly a 32-character hexadecimal UUID + canonical extension
        self.assertRegex(stored_name, r"^[a-f0-9]{32}\.png$")

        # 3. File exists on disk only under the renamed UUID
        self.assertTrue((self.tmp / stored_name).is_file())
        self.assertFalse((self.tmp / original_name).exists())

        # 4. Requesting original filename via public endpoint returns 404
        anon_client = APIClient()
        self.assertEqual(anon_client.get(f"/uploads/{original_name}").status_code, 404)

    def test_uploaded_jpeg_extension_is_canonically_normalized(self):
        resp = self.client.post(
            URL,
            {"file": _file("vacation.jpeg", JPEG, "image/jpeg")},
            format="multipart",
            HTTP_HOST="localhost:8000",
        )
        self.assertEqual(resp.status_code, 201)
        url = resp.json()["url"]
        stored_name = url.rsplit("/", 1)[-1]
        # Canonical extension for JPEG is normalized to .jpg
        self.assertRegex(stored_name, r"^[a-f0-9]{32}\.jpg$")
        self.assertTrue((self.tmp / stored_name).is_file())
