"""Proxy-fetch dispatch seam: server-vs-client fetch decision in execute_sync_job.

The orchestrator gates keyed providers: when the server lacks the provider key
but an online, capable ``ClientDevice`` holds one, the claimed job is parked as
``awaiting_client`` and a ``fetch_request`` is published on the owning user's
persistent SSE channel instead of running the server-side httpx fetch. When no
device is available — or the server does hold the key — the engine runs exactly
as before. Tests use provider ``fanart`` (a keyed provider with no real engine,
so a local stub registers without colliding) and fake Redis across the
progress/sse/fetch-proxy seams.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.integrations.models import ClientDevice, SyncJob
from apps.integrations.services import register_sync_engine
from apps.integrations.services.fetch_proxy import (
    dispatch_to_client,
    fetch_request_channel,
    server_can_fetch,
)
from apps.integrations.services.sync import execute_sync_job
from apps.integrations.tests._sse_fakes import FakeRedis

User = get_user_model()


@register_sync_engine("fanart")
def _fanart_stub_engine(job: SyncJob) -> dict:
    """Local stand-in for a keyed-provider engine (no real fanart sync engine)."""
    return {"seeded": 1}


class ServerCanFetchTests(TestCase):
    def test_keyless_and_unknown_providers_are_server_handled(self):
        for provider in ("musicbrainz", "plex", "youtube", "steam", "made-up"):
            with self.subTest(provider=provider):
                self.assertTrue(server_can_fetch(provider))

    @override_settings(TMDB_API_KEY="")
    def test_keyed_provider_without_server_key_cannot_fetch(self):
        self.assertFalse(server_can_fetch("tmdb"))

    @override_settings(TMDB_API_KEY="server-key")
    def test_keyed_provider_with_server_key_can_fetch(self):
        self.assertTrue(server_can_fetch("tmdb"))

    @override_settings(IGDB_CLIENT_ID="id", IGDB_CLIENT_SECRET="")
    def test_igdb_requires_both_keys(self):
        self.assertFalse(server_can_fetch("igdb"))

    @override_settings(IGDB_CLIENT_ID="id", IGDB_CLIENT_SECRET="secret")
    def test_igdb_satisfied_when_both_keys_present(self):
        self.assertTrue(server_can_fetch("igdb"))


class DispatchDecisionTests(TestCase):
    """dispatch_to_client unit behaviour against a job already claimed running."""

    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.job = SyncJob.objects.create(
            provider="fanart", entity_type="movie", external_id="550", status="running"
        )

    def _device(self, **kwargs):
        defaults = {
            "user": self.owner,
            "device_id": "desktop-1",
            "kind": "desktop",
            "provider_keys": {"fanart": {"key": "k"}},
            "capabilities": {"providers": ["fanart"]},
        }
        defaults.update(kwargs)
        device = ClientDevice.objects.create(**defaults)
        device.touch()
        return device

    def test_picks_newest_online_capable_device_and_parks_job(self):
        self.fake = FakeRedis()
        patchers = [
            mock.patch(
                "apps.integrations.services.fetch_proxy.get_client",
                return_value=self.fake,
            ),
            mock.patch("core.progress.get_client", return_value=self.fake),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

        self._device(device_id="older", name="old")
        self._device(device_id="newer", name="new")  # newest last_seen wins
        self.assertTrue(dispatch_to_client(self.job, task_id=str(self.job.pk)))

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "awaiting_client")
        self.assertEqual(self.job.user_id, self.owner.pk)

        channel = fetch_request_channel(self.owner.pk)
        (raw,) = self.fake.published_on(channel)
        payload = json.loads(raw)
        self.assertEqual(
            payload,
            {
                "task_id": str(self.job.pk),
                "provider": "fanart",
                "entity_type": "movie",
                "external_id": "550",
            },
        )

    def test_offline_device_is_not_offered(self):
        self.fake = FakeRedis()
        patchers = [
            mock.patch(
                "apps.integrations.services.fetch_proxy.get_client",
                return_value=self.fake,
            ),
            mock.patch("core.progress.get_client", return_value=self.fake),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

        device = self._device()
        device.touch()
        # Age it past the freshness window → no longer online.
        ClientDevice.objects.filter(pk=device.pk).update(last_seen=None)
        self.assertFalse(dispatch_to_client(self.job, task_id=str(self.job.pk)))
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "running")
        self.assertIsNone(self.job.user_id)

    def test_keyless_capable_device_is_not_offered(self):
        self._device(provider_keys={})  # capable but no key stored
        self.assertFalse(dispatch_to_client(self.job, task_id=str(self.job.pk)))
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "running")

    def test_incapable_online_device_is_not_offered(self):
        self._device(capabilities={"providers": ["tmdb"]})  # online but wrong caps
        self.assertFalse(dispatch_to_client(self.job, task_id=str(self.job.pk)))
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "running")


@override_settings(FANART_API_KEY="")
class ProxyDispatchExecutionTests(TestCase):
    """End-to-end execute_sync_job gate: park on device, else run the engine."""

    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.fake = FakeRedis()
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch("core.sse.get_client", return_value=self.fake),
            mock.patch("core.sse.get_async_client", return_value=self.fake),
            mock.patch(
                "apps.integrations.services.fetch_proxy.get_client",
                return_value=self.fake,
            ),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def _job(self):
        return SyncJob.objects.create(
            provider="fanart", entity_type="movie", external_id="550", status="pending"
        )

    def _online_capable_device(self):
        device = ClientDevice.objects.create(
            user=self.owner,
            device_id="desktop-1",
            kind="desktop",
            provider_keys={"fanart": {"key": "k"}},
            capabilities={"providers": ["fanart"]},
        )
        device.touch()
        return device

    def test_parks_job_for_online_device_without_running_engine(self):
        self._online_capable_device()
        job = self._job()

        outcome = execute_sync_job(job.pk)

        self.assertEqual(outcome["status"], "awaiting_client")
        job.refresh_from_db()
        self.assertEqual(job.status, "awaiting_client")
        self.assertEqual(job.user_id, self.owner.pk)

        # fetch_request went to the device owner's channel...
        (raw,) = self.fake.published_on(fetch_request_channel(self.owner.pk))
        self.assertEqual(json.loads(raw)["provider"], "fanart")
        self.assertEqual(json.loads(raw)["entity_type"], "movie")
        self.assertEqual(json.loads(raw)["external_id"], "550")

        # ...and the job's own sync stream shows parked, never a terminal frame.
        channel = f"fanart:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(types, ["sync_started", "awaiting_client"])
        self.assertNotIn("sync_complete", types)
        self.assertNotIn("error", types)

    def test_runs_engine_when_no_device_is_online(self):
        job = self._job()  # no ClientDevice at all
        outcome = execute_sync_job(job.pk)

        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["seeded"], 1)
        job.refresh_from_db()
        self.assertEqual(job.status, "completed")
        self.assertFalse(self.fake.published_on(fetch_request_channel(self.owner.pk)))


@override_settings(FANART_API_KEY="server-key")
class ServerFallbackExecutionTests(TestCase):
    """A server that does hold the key runs its own engine, ignoring devices."""

    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.fake = FakeRedis()
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch("core.sse.get_client", return_value=self.fake),
            mock.patch("core.sse.get_async_client", return_value=self.fake),
            mock.patch(
                "apps.integrations.services.fetch_proxy.get_client",
                return_value=self.fake,
            ),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_server_key_present_runs_engine_even_with_device_online(self):
        device = ClientDevice.objects.create(
            user=self.owner,
            device_id="desktop-1",
            kind="desktop",
            provider_keys={"fanart": {"key": "k"}},
            capabilities={"providers": ["fanart"]},
        )
        device.touch()
        job = SyncJob.objects.create(
            provider="fanart", entity_type="movie", external_id="550", status="pending"
        )

        outcome = execute_sync_job(job.pk)

        self.assertEqual(outcome["status"], "success")
        job.refresh_from_db()
        self.assertEqual(job.status, "completed")
        self.assertFalse(self.fake.published_on(fetch_request_channel(self.owner.pk)))
