from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status

from otix.api.deps import get_current_user
from otix.domain.user import User
from otix.infrastructure.config import settings

upload_router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

MAX_SIZE = settings.upload_max_size_mb * 1024 * 1024


@upload_router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    # Browser may send content-type with parameters (e.g. "image/png; charset=binary")
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

    await file.seek(0)
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max {settings.upload_max_size_mb}MB",
        )

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = upload_dir / filename
    filepath.write_bytes(contents)

    base_url = f"{request.url.scheme}://{request.url.netloc}"
    return {"url": f"{base_url}/uploads/{filename}"}
