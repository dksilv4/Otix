"""Endpoint tests for ``POST /api/v1/upload`` (authenticated image upload).

The route mirrors the legacy FastAPI ``/upload``: validates declared
content-type + filename extension against the allowed image set, sniffs magic
bytes, enforces the size cap, then writes a uuid-named blob under
``settings.UPLOAD_DIR`` and returns the absolute ``/uploads/<name>`` URL.
Tests redirect ``UPLOAD_DIR`` to a temp dir so no files land in the repo.
"""

import re
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

User = get_user_model()

URL = "/api/v1/upload"

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
JPEG = b"\xff\xd8\xff" + b"\x00" * 8
GIF = b"GIF89a" + b"\x00" * 8
WEBP = b"RIFF" + b"\x00" * 8

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
        self.assertEqual(written[0].read_bytes(), PNG)

    def test_uploads_jpeg(self):
        resp = self.post(name="photo.jpg", ct="image/jpeg", body=JPEG)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(self.files()), 1)

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
        self.assertEqual(b"".join(get_resp.streaming_content), PNG)

    def test_serve_via_api_v1_path(self):
        resp = self.post(name="photo.jpg", ct="image/jpeg", body=JPEG)
        self.assertEqual(resp.status_code, 201)
        filename = resp.json()["url"].rsplit("/", 1)[-1]

        anon_client = APIClient()
        get_resp = anon_client.get(f"/api/v1/uploads/{filename}")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.headers["Content-Type"], "image/jpeg")
        self.assertEqual(b"".join(get_resp.streaming_content), JPEG)

    def test_serve_nonexistent_file_404(self):
        anon_client = APIClient()
        get_resp = anon_client.get("/uploads/00000000000000000000000000000000.png")
        self.assertEqual(get_resp.status_code, 404)

    def test_serve_disallowed_extension_404(self):
        # Even if a file exists in UPLOAD_DIR, only allowed image extensions are served
        secret = self.tmp / "passwords.txt"
        secret.write_text("secret")
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
        self.assertEqual(b"".join(file_resp.streaming_content), PNG)
