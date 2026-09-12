# TODO: Review this file
"""Cursor-based pagination helpers.

Cursors are base64-encoded JSON strings containing the position data needed to
resume a listing after a specific item.
"""

from __future__ import annotations

import base64
import json


def encode_cursor(data: dict[str, str | int | float]) -> str:
    """Encode position data into an opaque cursor string."""
    payload = json.dumps(data, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> dict[str, str | int | float] | None:
    """Decode a cursor string back to position data. Returns None on malformed input."""
    if not cursor:
        return None
    try:
        padding = 4 - len(cursor) % 4
        if padding != 4:
            cursor += "=" * padding
        payload = base64.urlsafe_b64decode(cursor.encode()).decode()
        return json.loads(payload)
    except (ValueError, json.JSONDecodeError):
        return None
