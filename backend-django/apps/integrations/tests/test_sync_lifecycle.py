"""Roundtrip tests for the provider-sync job lifecycle (write half → SSE read).

The write half (``core.progress.RedisProgress``) publishes ``{provider}:sync``
frames and stores result/progress keys; the read half (``core.sse``) streams them
back. An autodiscovered Celery task (``run_sync_job``) executes a ``SyncJob`` in
eager mode (no broker), driving the whole contract: claim → ``sync_started`` →
engine → ``sync_complete`` + stored result → job completed, with ``error`` paths
for missing engines / engine exceptions. Redis is faked by patching
``core.progress.get_client`` and ``core.sse.get_client`` to the same in-memory
client so writer and reader share state. Engines are registered under distinct
providers so the module-global registry stays isolated between tests.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.services import register_sync_engine
from apps.integrations.services.sync import execute_sync_job
from apps.integrations.tasks import run_sync_job
from core import progress as progress_lib
from core import sse as sse_lib

User = get_user_model()


@register_sync_engine("demo")
def _demo_engine(job: SyncJob) -> dict:
    """Reference engine: streams one intermediate frame, then reports counts."""
    progress_lib.RedisProgress(f"{job.provider}:sync").publish(
        str(job.pk), "sync_progress", phase="fetch", pct=50
    )
    return {"counts": {"added": 3, "updated": 0}}


@register_sync_engine("boom")
def _boom_engine(job: SyncJob) -> dict:
    raise ValueError("kaput")


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
    """In-memory stand-in for ``redis.Redis`` shared by writer and reader."""

    def __init__(self):
        self.stored: dict[str, bytes | str] = {}
        self.published: list[tuple[str, str]] = []
        self.pubsubs: list[FakePubSub] = []

    def set(self, key, value, ex=None):
        self.stored[key] = value

    def get(self, key):
        return self.stored.get(key)

    def publish(self, channel, message):
        self.published.append((channel, message))
        return 1

    def pubsub(self):
        pubsub = FakePubSub(self._live_messages())
        self.pubsubs.append(pubsub)
        return pubsub

    def _live_messages(self):
        # Every published frame is offered to a newly-joined subscriber; the
        # read half consumes them in publish order until a terminal frame.
        return [msg for (_channel, msg) in self.published]

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
                payloads.append(json.loads(line[len("data: "):]))
    return payloads


class RedisProgressWriteTests(TestCase):
    """The write-half key shapes + fail-open behaviour (no DB rows involved)."""

    def setUp(self):
        self.fake = FakeRedis()
        patcher = mock.patch("core.progress.get_client", return_value=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_publish_writes_typed_frame_to_events_channel(self):
        progress_lib.RedisProgress("plex:sync").publish(
            "42", "sync_progress", phase="fetch", pct=50
        )
        self.assertEqual(
            self.fake.published_on("plex:sync:42:events"),
            ['{"type":"sync_progress","phase":"fetch","pct":50}'],
        )

    def test_store_result_writes_bare_dict_no_type(self):
        progress_lib.RedisProgress("plex:sync").store_result(
            "42", {"phase": "done", "total": 10}
        )
        self.assertEqual(
            self.fake.stored["plex:sync:42:result"], '{"phase":"done","total":10}'
        )
        self.assertEqual(
            progress_lib.RedisProgress("plex:sync").get_stored_result("42"),
            {"phase": "done", "total": 10},
        )

    def test_store_progress_round_trips_with_type(self):
        progress = progress_lib.RedisProgress("youtube:sync")
        progress.store_progress("7", "sync_progress", pct=40)
        self.assertEqual(
            progress.get_latest_progress("7"),
            {"type": "sync_progress", "pct": 40},
        )

    def test_set_applies_ttl(self):
        fake_set = mock.Mock(wraps=self.fake.set)
        self.fake.set = fake_set
        progress_lib.RedisProgress("plex:sync").store_result("42", {"ok": True})
        fake_set.assert_called_once()
        self.assertIn("ex", fake_set.call_args.kwargs)
        self.assertEqual(fake_set.call_args.kwargs["ex"], 86400)

    def test_fail_open_on_redis_errors(self):
        def boom(*args, **kwargs):
            raise RuntimeError("redis down")

        self.fake.set = boom
        self.fake.publish = boom
        self.fake.get = boom
        progress = progress_lib.RedisProgress("plex:sync")
        progress.publish("42", "sync_started")  # must not raise
        progress.store_result("42", {"ok": True})
        progress.store_progress("42", "sync_progress", pct=10)
        self.assertIsNone(progress.get_stored_result("42"))
        self.assertIsNone(progress.get_latest_progress("42"))


class SyncJobExecutionTests(TestCase):
    """Eager ``run_sync_job`` lifecycle through the shared fake Redis."""

    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.fake = FakeRedis()
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch("core.sse.get_client", return_value=self.fake),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def job(self, provider, entity_type="user"):
        return SyncJob.objects.create(
            provider=provider,
            entity_type=entity_type,
            external_id=str(self.user.id),
            status="pending",
        )

    def test_happy_path_completes_job_and_streams_terminal_frame(self):
        job = self.job("demo")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["counts"], {"added": 3, "updated": 0})
        self.assertEqual(job.status, "completed")
        self.assertIsNotNone(job.started_at)
        self.assertIsNotNone(job.completed_at)
        self.assertIsNone(job.error_message)

        channel = f"demo:sync:{job.pk}:events"
        types = [
            json.loads(msg)["type"] for msg in self.fake.published_on(channel)
        ]
        self.assertEqual(types, ["sync_started", "sync_progress", "sync_complete"])
        complete = json.loads(
            [msg for msg in self.fake.published_on(channel) if "sync_complete" in msg][0]
        )
        self.assertEqual(complete["type"], "sync_complete")
        self.assertEqual(complete["counts"], {"added": 3, "updated": 0})

    def test_stored_result_replays_as_sync_complete_to_late_client(self):
        job = self.job("demo")
        run_sync_job.delay(job.pk).get()

        # A client connecting after completion hits the stored-result replay.
        stream = sse_lib.sse_event_stream(
            f"demo:sync:{job.pk}:events",
            terminal_events=("sync_complete", "error"),
            result_replay=lambda: sse_lib.read_json_key(
                f"demo:sync:{job.pk}:result"
            ),
        )
        payloads = _data_payloads(stream)
        self.assertEqual(len(payloads), 1)
        self.assertEqual(payloads[0]["type"], "sync_complete")
        self.assertEqual(payloads[0]["provider"], "demo")
        self.assertEqual(payloads[0]["task_id"], str(job.pk))
        self.assertEqual(payloads[0]["counts"], {"added": 3, "updated": 0})
        self.assertEqual(self.fake.pubsubs, [])  # replay short-circuits subscribe

    def test_live_client_streams_recorded_frames_until_terminal(self):
        job = self.job("demo")
        run_sync_job.delay(job.pk).get()

        channel = f"demo:sync:{job.pk}:events"
        payloads = _data_payloads(
            sse_lib.sse_event_stream(
                channel, terminal_events=("sync_complete", "error")
            )
        )
        self.assertEqual(
            [p["type"] for p in payloads],
            ["sync_started", "sync_progress", "sync_complete"],
        )

    def test_no_engine_marks_job_failed_and_publishes_error(self):
        job = self.job("ghost")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(job.status, "failed")
        self.assertIsNotNone(job.completed_at)
        self.assertEqual(
            job.error_message,
            "No sync engine registered for provider 'ghost'",
        )

        channel = f"ghost:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(types, ["sync_started", "error"])
        self.assertEqual(
            json.loads(self.fake.published_on(channel)[-1])["message"],
            "No sync engine registered for provider 'ghost'",
        )
        stored = progress_lib.RedisProgress("ghost:sync").get_stored_result(job.pk)
        self.assertEqual(stored["error"], "No sync engine registered for provider 'ghost'")

    def test_engine_exception_marks_job_failed_with_generic_frame(self):
        job = self.job("boom")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "kaput")  # detail stays server-side
        last_frame = json.loads(self.fake.published_on(f"boom:sync:{job.pk}:events")[-1])
        self.assertEqual(last_frame["type"], "error")
        self.assertEqual(last_frame["message"], "Sync failed unexpectedly")

    def test_second_execution_of_completed_job_is_skipped(self):
        job = self.job("demo")
        first = run_sync_job.delay(job.pk).get()
        frames = len(self.fake.published)
        second = execute_sync_job(job.pk)
        self.assertEqual(first["status"], "success")
        self.assertEqual(second, {"status": "skipped", "task_id": str(job.pk)})
        self.assertEqual(len(self.fake.published), frames)  # nothing republished
