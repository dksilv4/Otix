"""Catalog change events over Redis pub/sub (SSE read half in views)."""

from __future__ import annotations

import json
import logging
from typing import Any

from core.redis import get_client

logger = logging.getLogger(__name__)

CATALOG_CHANNEL = "catalog:media"


def publish_catalog_event(event_type: str, **data: Any) -> None:
    """Publish a catalog event. Fail-open so ingest never dies on Redis."""
    payload = json.dumps({"type": event_type, **data}, default=str, separators=(",", ":"))
    try:
        get_client().publish(CATALOG_CHANNEL, payload)
    except Exception:  # noqa: BLE001
        logger.warning("catalog event publish failed type=%s", event_type)


def publish_media_updated(*, media_id: int, media_type: str, completeness_score: float) -> None:
    publish_catalog_event(
        "media.updated",
        id=media_id,
        mediaType=media_type,
        completenessScore=completeness_score,
    )


def publish_media_merged(*, from_id: int, to_id: int, media_type: str) -> None:
    publish_catalog_event(
        "media.merged",
        fromId=from_id,
        toId=to_id,
        mediaType=media_type,
    )
