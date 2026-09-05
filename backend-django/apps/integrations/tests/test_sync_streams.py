"""Tests for the SSE/Redis realtime sync surface.

Covers the enqueue POSTs (``/integrations/plex/sync``, ``/youtube/sync``) which
persist a ``SyncJob`` whose pk doubles as the SSE ``task_id``, the terminal
sync-stream GETs (stored-result replay + live Redis pub/sub frames that close on
``sync_complete``/``error``), and the persistent ``/notifications/stream``
generator. Redis is never touched for real: ``core.sse.get_client`` is patched
with an in-memory fake (``.get`` for stored keys, ``.pubsub`` for live frames).
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import SyncJob
from core import sse as sse_lib

User = get_user_model()


class FakePubSub:
    def __init__(self, messages):
        self._messages = list(messages)
        self.subscribed = None
        self.closed = False
        self.unsubscribed = False

    def subscribe(self, channel):
        self.subscribed = channel

    def get_message(self, ignore_subscribe_messages=True, timeout=None):
        if self._messages:
            return {"type": "message", "data": self._messages.pop(0)}
        return None

    def unsubscribe(self):
        self.unsubscribed = True

    def close(self):
        self.closed = True


class FakeRedis:
    def __init__(self, stored=None, messages=()):
        self._stored = stored or {}
        self._messages = list(messages)
        self.pubsubs = []

    def get(self, key):
        return self._stored.get(key)

    def pubsub(self):
        pubsub = FakePubSub(self._messages)
        self.pubsubs.append(pubsub)
        return pubsub


def _data_payloads(chunks):
    """Decode the ``data: {json}`` frames yielded by an SSE stream."""
    payloads = []
    for chunk in chunks:
        if isinstance(chunk, bytes):
            chunk = chunk.decode("utf-8")
        for line in chunk.splitlines():
            if line.startswith("data: "):
                payloads.append(json.loads(line[len("data: "):]))
    return payloads


def _terminal_bytes(**payload):
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class SyncEnqueueEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.user.google_id = "google-1"
        self.user.save(update_fields=("google_id",))
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.plex_url = "/api/v1/integrations/plex/sync"
        self.youtube_url = "/api/v1/integrations/youtube/sync"

    def _anonymously(self):
        return APIClient()

    def test_enqueue_requires_auth(self):
        resp = self._anonymously().post(self.plex_url, {}, format="json")
        self.assertEqual(resp.status_code, 401)
        resp = self._anonymously().post(self.youtube_url, {}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_plex_library_sync_202_returns_task_id_equal_pk(self):
        resp = self.client.post(
            self.plex_url, {"library_id": "lib-9"}, format="json"
        )
        self.assertEqual(resp.status_code, 202)
        job = SyncJob.objects.get()
        self.assertEqual(resp.json(), {"task_id": str(job.pk)})
        self.assertEqual(job.provider, "plex")
        self.assertEqual(job.entity_type, "library")
        self.assertEqual(job.external_id, "lib-9")
        self.assertEqual(job.status, "pending")

    def test_plex_user_sync_when_no_library_id(self):
        resp = self.client.post(self.plex_url, {}, format="json")
        self.assertEqual(resp.status_code, 202)
        job = SyncJob.objects.get()
        self.assertEqual(job.entity_type, "user")
        self.assertEqual(job.external_id, str(self.user.id))

    def test_youtube_sync_requires_google_account(self):
        self.user.google_id = None
        self.user.save(update_fields=("google_id",))
        resp = self.client.post(self.youtube_url, {}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json(), {"detail": "No Google account linked"})

    def test_youtube_sync_202_enqueues_and_dispatches(self):
        with mock.patch("apps.integrations.views.sync.run_sync_job") as task:
            resp = self.client.post(self.youtube_url, {}, format="json")
        self.assertEqual(resp.status_code, 202)
        job = SyncJob.objects.get()
        self.assertEqual(resp.json(), {"task_id": str(job.pk)})
        self.assertEqual(job.provider, "youtube")
        self.assertEqual(job.entity_type, "watch-history")
        self.assertEqual(job.external_id, str(self.user.id))
        self.assertEqual(job.status, "pending")
        task.delay.assert_called_once_with(job.pk)


class SyncStreamViewTests(TestCase):
    """The terminal SSE stream views (channel ``{provider}:sync:{task}``)."""

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.job = SyncJob.objects.create(
            provider="plex", entity_type="user", external_id=str(self.user.id)
        )
        self.plex_stream = (
            f"/api/v1/integrations/plex/sync/{self.job.pk}/stream"
        )
        self.youtube_stream = (
            f"/api/v1/integrations/youtube/sync/{self.job.pk}/stream"
        )

    def test_streams_require_auth(self):
        for url in (self.plex_stream, self.youtube_stream):
            resp = APIClient().get(url)
            self.assertEqual(resp.status_code, 401)

    def test_stream_headers_are_sse(self):
        resp = self.client.get(self.plex_stream)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["Content-Type"], "text/event-stream")
        self.assertEqual(resp.headers["Cache-Control"], "no-cache")

    def test_stream_replays_stored_result_and_terminates(self):
        stored_key = f"plex:sync:{self.job.pk}:result"
        fake = FakeRedis(stored={stored_key: b'{"phase":"done","total":10}'})
        resp = self.client.get(self.plex_stream)
        with mock.patch("core.sse.get_client", return_value=fake):
            chunks = list(resp.streaming_content)
        self.assertEqual(
            _data_payloads(chunks),
            [{"type": "sync_complete", "phase": "done", "total": 10}],
        )
        self.assertEqual(fake.pubsubs, [])  # replay short-circuits subscribe

    def test_stream_closes_on_terminal_live_frame(self):
        fake = FakeRedis(
            messages=[_terminal_bytes(type="sync_complete", phase="done")]
        )
        resp = self.client.get(self.plex_stream)
        with mock.patch("core.sse.get_client", return_value=fake):
            chunks = list(resp.streaming_content)
        self.assertEqual(
            _data_payloads(chunks),
            [{"type": "sync_complete", "phase": "done"}],
        )
        self.assertEqual(fake.pubsubs[0].subscribed, f"plex:sync:{self.job.pk}:events")
        self.assertTrue(fake.pubsubs[0].unsubscribed)
        self.assertTrue(fake.pubsubs[0].closed)

    def test_youtube_stream_replays_progress_then_terminal(self):
        progress_key = f"youtube:sync:{self.job.pk}:progress"
        fake = FakeRedis(
            stored={progress_key: b'{"phase":"fetching","pct":40}'},
            messages=[_terminal_bytes(type="sync_complete", phase="done")],
        )
        resp = self.client.get(self.youtube_stream)
        with mock.patch("core.sse.get_client", return_value=fake):
            chunks = list(resp.streaming_content)
        self.assertEqual(
            _data_payloads(chunks),
            [
                {"phase": "fetching", "pct": 40},
                {"type": "sync_complete", "phase": "done"},
            ],
        )

    def test_error_frame_closes_stream(self):
        fake = FakeRedis(messages=[_terminal_bytes(type="error", message="boom")])
        resp = self.client.get(self.plex_stream)
        with mock.patch("core.sse.get_client", return_value=fake):
            chunks = list(resp.streaming_content)
        self.assertEqual(
            _data_payloads(chunks), [{"type": "error", "message": "boom"}]
        )


class NotificationStreamTests(TestCase):
    """Persistent SSE channel ``user:{id}:notifications`` (no terminal)."""

    url = "/api/v1/notifications/stream"

    def setUp(self):
        self.user = User.objects.create_user(username="carol", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_stream_requires_auth(self):
        resp = APIClient().get(self.url)
        self.assertEqual(resp.status_code, 401)

    def test_stream_headers_are_sse(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers["Content-Type"], "text/event-stream")

    def test_non_terminal_frame_keeps_stream_open_then_clean_close(self):
        """No terminal_events: a notification frame streams, close is manual."""
        fake = FakeRedis(
            messages=[_terminal_bytes(type="notification", id=7, text="hi")]
        )
        with mock.patch("core.sse.get_client", return_value=fake):
            stream = sse_lib.sse_event_stream(f"user:{self.user.id}:notifications")
            chunks = [next(stream)]
            # Generator is still alive after a non-terminal frame; close it.
            stream.close()
        self.assertEqual(
            _data_payloads(chunks), [{"type": "notification", "id": 7, "text": "hi"}]
        )
        self.assertEqual(fake.pubsubs[0].subscribed, f"user:{self.user.id}:notifications")
        self.assertTrue(fake.pubsubs[0].unsubscribed)
        self.assertTrue(fake.pubsubs[0].closed)
