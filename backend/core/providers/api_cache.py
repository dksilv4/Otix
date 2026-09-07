"""Local filesystem cache for raw API responses.

When enabled, each API response JSON is saved to disk by provider/date/endpoint.
On subsequent requests, the cached response is returned instead of hitting the
real API — useful for development, testing, and CI where API rate limits or
network latency are undesirable.

Cache directory structure:
    {cache_dir}/{provider}/{YYYY-MM-DD}/{url_safe_hash}.json

Configuration (in Django settings):
    API_CACHE_ENABLED: bool = True (BaseProvider auto-enables for local/dev/test)
    API_CACHE_DIR: str = "./.api_cache"
    API_CACHE_TTL_HOURS: int = 24
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class ApiCache:
    """Filesystem-backed cache for raw API JSON responses."""

    def __init__(
        self,
        cache_dir: str | Path = "./.api_cache",
        ttl_hours: int = 24,
        enabled: bool = True,
    ):
        self._cache_dir = Path(cache_dir)
        self._ttl_seconds = ttl_hours * 3600
        self._enabled = enabled

    @property
    def enabled(self) -> bool:
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool) -> None:
        self._enabled = value

    def _cache_path(self, provider: str, url: str) -> Path:
        """Return the filesystem path for a cached response."""
        date_str = datetime.now(UTC).strftime("%Y-%m-%d")
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
        return self._cache_dir / provider / date_str / f"{url_hash}.json"

    def get(self, provider: str, url: str) -> dict[str, Any] | list[Any] | None:
        """Return cached response data, or None if not cached or expired."""
        if not self._enabled:
            return None
        path = self._cache_path(provider, url)
        if not path.exists():
            return None
        # Check TTL
        age = datetime.now(UTC).timestamp() - path.stat().st_mtime
        if age > self._ttl_seconds:
            return None
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            return None

    def set(self, provider: str, url: str, data: dict[str, Any] | list[Any]) -> None:
        """Save a response to the cache."""
        if not self._enabled:
            return
        path = self._cache_path(provider, url)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False, default=str))
        except OSError:
            pass  # Cache miss on write is non-fatal

    def clear(self, provider: str | None = None) -> int:
        """Clear cache for a provider (or all providers if None). Return count of files removed."""
        import shutil

        target = self._cache_dir / provider if provider else self._cache_dir
        if not target.exists():
            return 0
        count = sum(len(files) for _, _, files in os.walk(target))
        shutil.rmtree(target, ignore_errors=True)
        return count
