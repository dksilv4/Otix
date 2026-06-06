# TODO: Review this file
from __future__ import annotations
import json
import structlog
from fastapi import APIRouter, Request

logger = structlog.get_logger()
router = APIRouter()

@router.post("/integrations/plex/webhook")
async def plex_webhook(request: Request) -> dict:
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
