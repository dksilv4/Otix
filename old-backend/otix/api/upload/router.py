from __future__ import annotations

import uuid
from pathlib import Path

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status

from otix.api.deps import get_current_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings

logger = structlog.get_logger()

upload_router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

MAX_SIZE = settings.upload_max_size_mb * 1024 * 1024

# Magic bytes signatures for allowed image types
_MAGIC_BYTES: dict[tuple[bytes, ...], str] = {
    (b"\xff\xd8\xff",): "image/jpeg",
    (b"\x89PNG\r\n\x1a\n",): "image/png",
    (b"GIF87a", b"GIF89a"): "image/gif",
    (b"RIFF",): "image/webp",  # WEBP starts with RIFF header
}


def _validate_magic_bytes(data: bytes) -> str | None:
    """Check magic bytes and return the detected MIME type, or None if unknown."""
    for signatures, mime in _MAGIC_BYTES.items():
        if any(data.startswith(sig) for sig in signatures):
            return mime
    return None


@upload_router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> dict[str, str]:
    """Upload an image file (PNG, JPEG, WebP, GIF).

    Returns the URL to the uploaded file. Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_write(ip)

    ct = file.content_type or ""
    if not any(ct.startswith(allowed) for allowed in ALLOWED_CONTENT_TYPES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: png, jpeg, webp, gif",
        )

    ext = Path(file.filename or ".png").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported extension: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    try:
        await file.seek(0)
        contents = await file.read()
        if len(contents) > MAX_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Max {settings.upload_max_size_mb}MB",
            )

        detected = _validate_magic_bytes(contents)
        if detected is None or detected not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File content does not match an allowed image type",
            )

        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = upload_dir / filename
        filepath.write_bytes(contents)

        scheme = request.headers.get("X-Forwarded-Proto", request.url.scheme)
        base_url = f"{scheme}://{request.url.netloc}"
        url = f"{base_url}/uploads/{filename}"
    except Exception:
        logger.exception("failed to upload file", user_id=current_user.id, ip=ip)
        raise

    logger.info("file uploaded", filename=filename, user_id=current_user.id, ip=ip)
    return {"url": url}
