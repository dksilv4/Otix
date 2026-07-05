from __future__ import annotations

import asyncio
import hashlib
import hmac
import json

import structlog
from fastapi import APIRouter, HTTPException, Request, status

from otix.infrastructure.config import settings

logger = structlog.get_logger()
router = APIRouter()


async def _read_body(request: Request) -> bytes:
    """Read raw request body, caching it so form/json parsing still works."""
    body = await request.body()
    return body


@router.post("/integrations/plex/webhook")
async def plex_webhook(request: Request) -> dict:
    secret = settings.plex_webhook_secret
    if not secret:
        logger.warning("plex_webhook_secret not configured — rejecting request")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Webhook not configured")
    signature = request.headers.get("X-Plex-Signature", "")
    if not signature:
        logger.warning("plex webhook missing X-Plex-Signature header")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature")
    raw_body = await _read_body(request)
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(f"sha256={expected}", signature):
        logger.warning("plex webhook invalid signature")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    payload = None
    content_type = request.headers.get("content-type", "")
    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            raw_payload = form.get("payload")
            if isinstance(raw_payload, str):
                payload = json.loads(raw_payload)
        elif "application/json" in content_type:
            payload = await request.json()
    except Exception:
        logger.exception("plex webhook payload parse failed")

    from otix.infrastructure.celery import app
    app.send_task("maintenance.sync_plex_accounts")
    return {
        "status": "accepted",
        "event": payload.get("event") if isinstance(payload, dict) else None,
    }
