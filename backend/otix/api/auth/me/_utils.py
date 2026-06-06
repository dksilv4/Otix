from __future__ import annotations

import structlog

logger = structlog.get_logger()


def _gravatar_url(avatar_hash: str | None) -> str | None:
    if not avatar_hash:
        return None
    return f"https://www.gravatar.com/avatar/{avatar_hash}?s=200"
