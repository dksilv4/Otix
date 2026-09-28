"""Testing utilities and mock transports for provider integrations.

Provides lightweight httpx mock transports for simulating external API responses
and fixture loading for unit and integration testing without network calls.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
from django.conf import settings as django_settings


def create_mock_transport(
    mapping: dict[tuple[str, str], tuple[int, Any]],
) -> httpx.MockTransport:
    """Create an ``httpx.MockTransport`` matching (method, URL/path) to canned responses.

    Args:
        mapping: Dictionary where keys are ``(METHOD, URL_OR_PATH)`` tuples
            (e.g., ``("GET", "/movie/550")`` or ``("POST", "https://api.igdb.com/v4/games")``)
            and values are ``(status_code, response_payload)`` tuples where payload
            can be a dict, list, string, or bytes.

    Returns:
        Configured ``httpx.MockTransport`` ready for ``httpx.AsyncClient(transport=...)``.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        method = request.method.upper()
        url_str = str(request.url)
        url_path = request.url.path
        query_str = request.url.query.decode("utf-8") if request.url.query else ""
        url_path_query = f"{url_path}?{query_str}" if query_str else url_path

        candidates = [
            (method, url_str),
            (method, url_path_query),
            (method, url_path),
            (method, url_path.rstrip("/")),
        ]

        for candidate in candidates:
            if candidate in mapping:
                status_code, content = mapping[candidate]
                if isinstance(content, (dict, list)):
                    return httpx.Response(status_code, json=content, request=request)
                if isinstance(content, bytes):
                    return httpx.Response(status_code, content=content, request=request)
                if isinstance(content, str):
                    return httpx.Response(status_code, text=content, request=request)
                return httpx.Response(status_code, json=content, request=request)

        return httpx.Response(
            404,
            json={"error": f"Mock transport route not found: {method} {request.url}"},
            request=request,
        )

    return httpx.MockTransport(handler=handler)


def load_fixture(provider: str, filename: str) -> dict[str, Any] | list[Any]:
    """Load and parse a canned JSON fixture for a given provider.

    Searches across ``sample_data/{provider}/`` and provider-local ``fixtures/`` directories.

    Args:
        provider: Provider identifier string (e.g., 'tmdb', 'igdb', 'fanart').
        filename: Fixture file name or relative path
            (e.g., 'configuration.json' or 'movie/550.json').


    Returns:
        Parsed JSON dictionary or list.

    Raises:
        FileNotFoundError: If the fixture file cannot be located.
    """
    names_to_try = [filename]
    if not filename.endswith(".json"):
        names_to_try.append(f"{filename}.json")

    base_dir = Path(getattr(django_settings, "BASE_DIR", Path.cwd()))
    repo_root = base_dir.parent if base_dir.name == "backend" else base_dir

    candidate_dirs = [
        repo_root / "sample_data" / provider,
        base_dir / "core" / "providers" / provider / "fixtures",
        base_dir / "core" / "providers" / "fixtures" / provider,
        Path.cwd() / "sample_data" / provider,
    ]

    for cand_dir in candidate_dirs:
        for name in names_to_try:
            path = cand_dir / name
            if path.is_file():
                return json.loads(path.read_text(encoding="utf-8"))

    # Also check if filename was an absolute or directly accessible relative path
    for name in names_to_try:
        direct = Path(name)
        if direct.is_file():
            return json.loads(direct.read_text(encoding="utf-8"))

    raise FileNotFoundError(
        f"Fixture '{filename}' not found for provider '{provider}' across candidate dirs: "
        f"{[str(d) for d in candidate_dirs]}"
    )


class _FakeScript:
    """In-memory script double simulating the token-bucket Lua script."""

    def __init__(self, redis: FakeAsyncRedis) -> None:
        self._redis = redis

    async def __call__(self, *, keys: list[str], args: list[Any]) -> list[Any]:
        key = keys[0]
        now, rate, burst, requested = (float(a) for a in args)
        tokens = self._redis.storage.get(f"{key}:tokens")
        last = self._redis.storage.get(f"{key}:last")
        if tokens is None or last is None:
            tokens = burst
            last = now
        elapsed = now - last
        if elapsed > 0:
            tokens = min(burst, tokens + elapsed * rate)
        if tokens >= requested:
            tokens -= requested
            allowed = 1
            wait = 0.0
        else:
            allowed = 0
            wait = (requested - tokens) / rate
        self._redis.storage[f"{key}:tokens"] = tokens
        self._redis.storage[f"{key}:last"] = now
        return [allowed, str(tokens), str(wait)]


class FakeAsyncRedis:
    """In-memory async Redis double for testing rate limiting and cooldowns."""

    def __init__(self) -> None:
        import time

        self._time = time
        self.storage: dict[str, Any] = {}
        self._expires: dict[str, float] = {}
        self.registered: list[str] = []

    def register_script(self, script: str) -> _FakeScript:
        self.registered.append(script)
        return _FakeScript(self)

    async def set(self, key: str, value: Any, ex: float | int | None = None) -> None:
        self.storage[key] = value
        if ex is None:
            self._expires.pop(key, None)
        else:
            self._expires[key] = self._time.monotonic() + ex

    async def setex(self, key: str, time: int, value: Any) -> None:
        await self.set(key, value, ex=time)

    async def get(self, key: str) -> Any:
        if self._expired(key):
            return None
        return self.storage.get(key)

    async def ttl(self, key: str) -> int:
        if self._expired(key):
            return 0
        deadline = self._expires.get(key)
        if deadline is None:
            return -1
        remaining = deadline - self._time.monotonic()
        return int(remaining) if remaining > 0 else 0

    async def delete(self, *keys: str) -> int:
        for key in keys:
            self.storage.pop(key, None)
            self._expires.pop(key, None)
        return len(keys)

    async def lpush(self, key: str, value: Any) -> int:
        lst = self.storage.setdefault(key, [])
        if not isinstance(lst, list):
            lst = []
            self.storage[key] = lst
        lst.insert(0, value)
        return len(lst)

    async def ltrim(self, key: str, start: int, stop: int) -> bool:
        lst = self.storage.get(key)
        if isinstance(lst, list):
            self.storage[key] = lst[start : stop + 1 if stop >= 0 else None]
        return True

    def _expired(self, key: str) -> bool:
        deadline = self._expires.get(key)
        if deadline is not None and deadline <= self._time.monotonic():
            self.storage.pop(key, None)
            self._expires.pop(key, None)
            return True
        return False
