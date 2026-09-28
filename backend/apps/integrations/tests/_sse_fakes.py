"""Shared in-memory Redis doubles + collectors for the integrations sync tests.

The sync write half (``core.progress``) and the async SSE read half
(``core.sse``) must share one store so frames published / keys written by a job
are visible to a streaming client. ``FakeRedis`` exposes the sync
``set/get/publish`` surface the writer uses (patched in as
``core.progress.get_client``) and the sync key-read seam replay lambdas hit
(``core.sse.get_client``), plus a ``pubsub()`` factory (sync, mirroring
``redis.asyncio``) returning an async ``FakePubSub`` for the read half
(``core.sse.get_async_client``).
"""

from __future__ import annotations

import json

from asgiref.sync import async_to_sync


class FakePubSub:
    """Async stand-in for a ``redis.asyncio`` pubsub connection."""

    def __init__(self, messages):
        self._messages = list(messages)
        self.subscribed = None
        self.closed = False
        self.unsubscribed = False

    async def subscribe(self, channel):
        self.subscribed = channel

    async def get_message(self, ignore_subscribe_messages=True, timeout=None):
        if self._messages:
            return {"type": "message", "data": self._messages.pop(0)}
        return None

    async def unsubscribe(self):
        self.unsubscribed = True

    async def aclose(self):
        self.closed = True


class FakeRedis:
    """In-memory ``redis.Redis``: sync key ops (writer/replay) + async pubsub."""

    def __init__(self, stored=None, messages=()):
        self.stored = dict(stored or {})
        self._seeded = list(messages)
        self.published: list[tuple[str, str]] = []
        self.pubsubs: list[FakePubSub] = []

    # ── sync surface (core.progress writer + core.sse replay reads) ─────────
    def set(self, key, value, ex=None):
        self.stored[key] = value

    def get(self, key):
        return self.stored.get(key)

    def publish(self, channel, message):
        self.published.append((channel, message))
        return 1

    # ── async read surface (core.sse read half) ─────────────────────────────
    def pubsub(self):
        # A subscriber sees frames published before it joined plus any seeded
        # fixture messages (stands in for a client connected during the job).
        messages = list(self._seeded) + [msg for (_c, msg) in self.published]
        pubsub = FakePubSub(messages)
        self.pubsubs.append(pubsub)
        return pubsub

    def published_on(self, channel):
        return [msg for (c, msg) in self.published if c == channel]


def _data_payloads(chunks):
    """Decode the ``data: {json}`` frames yielded by an SSE stream."""
    payloads = []
    for chunk in chunks:
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8")
        for line in chunk.splitlines():
            if line.startswith("data: "):
                payloads.append(json.loads(line[len("data: ") :]))
    return payloads


def collect_stream(agen):
    """Run an async SSE generator to completion synchronously; return chunks."""

    async def _run():
        return [chunk async for chunk in agen]

    return async_to_sync(_run)()


def take_first_and_close(agen):
    """Pull one chunk off an async SSE generator, then close it (for
    non-terminating/persistent streams where full consumption would block)."""

    async def _run():
        try:
            return await anext(agen)
        except StopAsyncIteration:
            return None
        finally:
            await agen.aclose()

    return async_to_sync(_run)()
