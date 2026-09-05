"""Shared Redis client factory.

SSE streams (``core.sse``) and any future realtime publisher build their client
from ``settings.REDIS_URL`` on first call. The ``redis`` dependency is only
imported when a connection is actually opened, so apps that never touch
realtime don't pay for it; tests patch ``core.sse.get_client`` (or here) with a
fake.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings


def get_client() -> Any:
    """Return a sync ``redis.Redis`` client bound to ``settings.REDIS_URL``."""
    from redis import Redis  # local import: only pay the dep when realtime is used

    url = getattr(settings, "REDIS_URL", "") or "redis://127.0.0.1:6379/0"
    return Redis.from_url(url)
