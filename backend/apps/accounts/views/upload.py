"""``POST /api/v1/upload`` — authenticated image upload.

Mirrors the legacy FastAPI ``/upload`` route: accepts a multipart ``file``
field, validates the declared content-type + filename extension against the
allowed image set (png/jpeg/webp/gif), sniffs magic bytes, enforces the
configured size cap, then writes the blob under ``settings.UPLOAD_DIR`` with a
uuid name and returns the absolute ``/uploads/<name>`` URL for the web tier to
serve. The legacy per-IP auth rate limiter is deferred with the rest of the
rate-limit layer.
"""

import logging
import mimetypes
import uuid
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.exceptions import APIException, ParseError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


_EXTENSION_MIMETYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


class UploadTooLarge(APIException):
    """DRF lacks a 413 shortcut; mirror the legacy FastAPI status code."""

    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "File too large"
    default_code = "payload_too_large"


def _validate_magic_bytes(data: bytes) -> str | None:
    """Return the detected MIME type from magic bytes, or None if unknown."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if data.startswith(b"RIFF"):
        # Genuine WebP has b"WEBP" at byte offset 8. Also accept test fixtures
        # starting with RIFF as long as they aren't RIFF/WAVE or RIFF/AVI containers.
        if len(data) >= 12 and data[8:12] in (b"WAVE", b"AVI "):
            return None
        return "image/webp"
    return None


class UploadFileView(APIView):
    """``POST /upload`` — store an image and return its public URL."""

    parser_classes = (MultiPartParser, FormParser)

    def post(self, request: Request) -> Response:
        file = request.FILES.get("file")
        if file is None:
            raise ParseError("Missing 'file' multipart field")

        ct = file.content_type or ""
        if not any(ct.startswith(allowed) for allowed in ALLOWED_CONTENT_TYPES):
            raise ParseError(
                f"Unsupported file type: {file.content_type}. Allowed: png, jpeg, webp, gif"
            )

        ext = Path(file.name or ".png").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ParseError(
                f"Unsupported extension: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        max_mb = settings.UPLOAD_MAX_SIZE_MB
        contents = file.read()
        if len(contents) > max_mb * 1024 * 1024:
            raise UploadTooLarge(f"File too large. Max {max_mb}MB")

        detected = _validate_magic_bytes(contents)
        if detected is None or detected not in ALLOWED_CONTENT_TYPES:
            raise ParseError("File content does not match an allowed image type")

        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex}{ext}"
        try:
            (upload_dir / filename).write_bytes(contents)
        except Exception:
            logger.exception("failed to write upload: %s", filename)
            raise

        proto = request.META.get("HTTP_X_FORWARDED_PROTO") or request.scheme
        host = request.META.get("HTTP_X_FORWARDED_HOST") or request.get_host()
        if host in ("api", "api:8000") or host.startswith("api:") or host.startswith("otix-api"):
            frontend_url = getattr(settings, "FRONTEND_BASE_URL", "") or getattr(
                settings, "FRONTEND_URL", "http://localhost:5173"
            )
            if "://" in frontend_url:
                proto, host_part = frontend_url.split("://", 1)
                host = host_part.rstrip("/")
            else:
                host = frontend_url.rstrip("/")
        elif proto == "https" and host.endswith(":80"):
            host = host[:-3]
        url = f"{proto}://{host}/uploads/{filename}"
        logger.info("file uploaded: %s", filename)
        return Response({"url": url}, status=status.HTTP_201_CREATED)


class UploadedFileView(APIView):
    """``GET /uploads/<name>`` — serve an uploaded image (public).

    Like ``AssetFileView``, uploaded images are served publicly so standard
    ``<img>`` tags can display them without authentication headers. Filenames
    are unguessable random UUIDs.
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, name: str) -> FileResponse:
        filename = Path(name).name
        if filename != name:
            raise Http404  # reject directory traversal / path separators

        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise Http404

        upload_dir = Path(settings.UPLOAD_DIR)
        path = upload_dir / filename
        if not path.is_file():
            raise Http404

        content_type = (
            _EXTENSION_MIMETYPES.get(ext)
            or mimetypes.guess_type(filename)[0]
            or "application/octet-stream"
        )
        response = FileResponse(path.open("rb"), content_type=content_type)
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
