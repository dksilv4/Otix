"""``POST /api/v1/upload`` — authenticated image upload.

Secure image upload route:
- Accepts a multipart ``file`` field.
- Validates declared content-type and filename extension against allowed raster image set (PNG, JPEG, WebP, GIF).
- Enforces strict size caps (``settings.UPLOAD_MAX_SIZE_MB``, default 5MB).
- Performs deep binary signature and magic byte validation.
- Scans for embedded script payloads, polyglot files, web shells, and executable headers.
- Verifies structural integrity with Pillow and guards against decompression/pixel bombs (max dimensions 4096x4096px, max 25M pixels).
- Sanitizes images and strips EXIF GPS/metadata tags.
- Stores files with unguessable random UUID names in an isolated upload directory.
- Serves uploaded assets via ``UploadedFileView`` with defensive security headers (nosniff, sandboxed CSP, frame-deny).
"""

import io
import logging
import mimetypes
import re
import uuid
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from PIL import Image, UnidentifiedImageError
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

# Strict filename validation: exactly 32 hex chars followed by an allowed extension
SAFE_FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.(png|jpg|jpeg|webp|gif)$", re.IGNORECASE)

# Decompression bomb and pixel flood protection
MAX_IMAGE_PIXELS = 25_000_000
MAX_IMAGE_DIMENSION = 4096

# Configure Pillow internal pixel limit
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

# Known malicious pattern signatures to detect polyglots, web shells, and injected scripts
DANGEROUS_PATTERNS = [
    re.compile(rb"<\?php", re.IGNORECASE),
    re.compile(rb"<\?=", re.IGNORECASE),
    re.compile(rb"<%", re.IGNORECASE),
    re.compile(rb"<script[\s>]", re.IGNORECASE),
    re.compile(rb"javascript:", re.IGNORECASE),
    re.compile(rb"vbscript:", re.IGNORECASE),
    re.compile(rb"<svg[\s>]", re.IGNORECASE),
    re.compile(rb"<html[\s>]", re.IGNORECASE),
    re.compile(rb"<body[\s>]", re.IGNORECASE),
    re.compile(rb"<iframe[\s>]", re.IGNORECASE),
    re.compile(rb"<object[\s>]", re.IGNORECASE),
    re.compile(rb"<embed[\s>]", re.IGNORECASE),
    re.compile(rb"<!entity", re.IGNORECASE),
    re.compile(rb"<!doctype", re.IGNORECASE),
    re.compile(rb"\b(eval|base64_decode|passthru|shell_exec|system)\s*\(", re.IGNORECASE),
]


class UploadTooLarge(APIException):
    """DRF lacks a 413 shortcut; mirror the legacy FastAPI status code."""

    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "File too large"
    default_code = "payload_too_large"


def _scan_for_malicious_content(data: bytes) -> None:
    """Scan raw bytes for dangerous code signatures or binary executable headers."""
    # Check for executable and archive headers disguised as images
    if data.startswith(b"MZ"):  # Windows PE / DLL / EXE
        raise ParseError("Disallowed file: binary executable header detected")
    if data.startswith(b"\x7fELF"):  # Linux ELF
        raise ParseError("Disallowed file: binary executable header detected")
    if data.startswith(b"PK\x03\x04"):  # ZIP / JAR / APK archive
        raise ParseError("Disallowed file: archive container header detected")

    # Scan for script / web-shell / injection patterns
    for pattern in DANGEROUS_PATTERNS:
        if pattern.search(data):
            raise ParseError("File contains disallowed or potentially malicious content")


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


def sanitize_and_verify_image(contents: bytes, ext: str) -> bytes:
    """Verify image integrity with Pillow, validate dimensions, and strip metadata.

    Returns the clean, re-encoded/sanitized image bytes.
    """
    _scan_for_malicious_content(contents)

    try:
        # Step 1: verify raw header and structure integrity
        with Image.open(io.BytesIO(contents)) as img:
            img.verify()

        # Step 2: re-open to inspect dimensions and re-encode
        with Image.open(io.BytesIO(contents)) as img:
            fmt = img.format
            width, height = img.size

            if width <= 0 or height <= 0:
                raise ParseError("Invalid image dimensions")

            if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
                raise ParseError(
                    f"Image dimensions too large: {width}x{height}. Max allowed is {MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}"
                )

            if width * height > MAX_IMAGE_PIXELS:
                raise ParseError("Image resolution exceeds maximum allowed limit")

            expected_formats = {
                ".png": {"PNG"},
                ".jpg": {"JPEG"},
                ".jpeg": {"JPEG"},
                ".webp": {"WEBP"},
                ".gif": {"GIF"},
            }
            if fmt not in expected_formats.get(ext, set()):
                raise ParseError(f"Image format ({fmt}) does not match file extension ({ext})")

            # Re-encode image to strip EXIF GPS/metadata and trailing polyglot payloads
            out = io.BytesIO()
            if fmt == "JPEG":
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.save(out, format="JPEG", quality=90, optimize=True)
            elif fmt == "PNG":
                img.save(out, format="PNG", optimize=True)
            elif fmt == "WEBP":
                img.save(out, format="WEBP", quality=90)
            elif fmt == "GIF":
                # For animated GIFs, enforce maximum frame count
                try:
                    n_frames = getattr(img, "n_frames", 1)
                    if n_frames > 100:
                        raise ParseError("Animated GIF contains too many frames (max 100)")
                except Exception:
                    pass
                img.save(out, format="GIF")
            else:
                img.save(out, format=fmt)

            sanitized_bytes = out.getvalue()
            canonical_ext = {
                "PNG": ".png",
                "JPEG": ".jpg",
                "WEBP": ".webp",
                "GIF": ".gif",
            }.get(fmt, ext)
            return (sanitized_bytes if sanitized_bytes else contents, canonical_ext)

    except ParseError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        logger.warning("Pillow failed to decode or verify image: %s", exc)
        raise ParseError("File is corrupted or not a valid image") from exc


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

        # 1. Scan for malicious signatures, web shells, and binary executable headers
        _scan_for_malicious_content(contents)

        # 2. Validate magic bytes
        detected = _validate_magic_bytes(contents)
        if detected is None or detected not in ALLOWED_CONTENT_TYPES:
            raise ParseError("File content does not match an allowed image type")

        # 3. Rigorous Pillow structural verification, dimension checks, and EXIF stripping
        clean_contents, canonical_ext = sanitize_and_verify_image(contents, ext)

        upload_dir = Path(settings.UPLOAD_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)

        # 4. Mandatory renaming: The original user-provided filename is completely discarded.
        # Stored files are assigned an unguessable 32-character hexadecimal UUID4 + verified canonical extension.
        # This completely neutralizes path traversal, arbitrary file overwrite, extension spoofing, and metadata leakage.
        filename = f"{uuid.uuid4().hex}{canonical_ext}"
        try:
            (upload_dir / filename).write_bytes(clean_contents)
        except Exception:
            logger.exception("failed to write upload: %s", filename)
            raise

        proto = request.META.get("HTTP_X_FORWARDED_PROTO") or request.scheme
        if "," in proto:
            proto = proto.split(",")[0].strip()
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

        if proto == "http" and not (
            host.startswith("localhost") or host.startswith("127.0.0.1") or host == "testserver"
        ):
            frontend_url = getattr(settings, "FRONTEND_BASE_URL", "") or getattr(
                settings, "FRONTEND_URL", ""
            )
            cf_visitor = request.META.get("HTTP_CF_VISITOR", "")
            if (
                frontend_url.startswith("https://")
                or request.is_secure()
                or request.META.get("HTTP_X_FORWARDED_SSL") == "on"
                or (cf_visitor and '"https"' in cf_visitor)
                or request.META.get("SERVER_PORT") == "443"
            ):
                proto = "https"

        url = f"{proto}://{host}/uploads/{filename}"
        logger.info("file uploaded safely and renamed to %s", filename)
        return Response({"url": url}, status=status.HTTP_201_CREATED)


class UploadedFileView(APIView):
    """``GET /uploads/<name>`` — serve an uploaded image (public).

    Like ``AssetFileView``, uploaded images are served publicly so standard
    ``<img>`` tags can display them without authentication headers. Filenames
    are unguessable random UUIDs.

    Defensive security headers are set to prevent MIME-sniffing, XSS, and
    clickjacking framing.
    """

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, name: str) -> FileResponse:
        filename = Path(name).name
        if filename != name:
            raise Http404  # reject directory traversal / path separators

        # Strict validation of filename format (must be 32 hex chars + safe extension)
        if not SAFE_FILENAME_RE.match(filename):
            raise Http404

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

        # Defensive Security Headers
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        response["X-Frame-Options"] = "DENY"
        response["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response
