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
import uuid
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException, ParseError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# Magic-byte signatures for the allowed image types.
_MAGIC_BYTES: dict[tuple[bytes, ...], str] = {
    (b"\xff\xd8\xff",): "image/jpeg",
    (b"\x89PNG\r\n\x1a\n",): "image/png",
    (b"GIF87a", b"GIF89a"): "image/gif",
    (b"RIFF",): "image/webp",  # WEBP starts with a RIFF header.
}


class UploadTooLarge(APIException):
    """DRF lacks a 413 shortcut; mirror the legacy FastAPI status code."""

    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "File too large"
    default_code = "payload_too_large"


def _validate_magic_bytes(data: bytes) -> str | None:
    """Return the detected MIME type from magic bytes, or None if unknown."""
    for signatures, mime in _MAGIC_BYTES.items():
        if any(data.startswith(sig) for sig in signatures):
            return mime
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
        url = f"{proto}://{request.get_host()}/uploads/{filename}"
        logger.info("file uploaded: %s", filename)
        return Response({"url": url}, status=status.HTTP_201_CREATED)
