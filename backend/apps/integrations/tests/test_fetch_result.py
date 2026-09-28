"""Proxy-fetch client surface: device upsert, SSE stream, parked-job result.

End-to-end DRF tests for the three ``/api/v1/fetch/*`` routes. The result
endpoint is the ingest seam: a ``SyncJob`` parked ``awaiting_client`` (from the
increment-63 dispatcher) is adopted, seeded from the client-POSTed raw dict
through the registered (provider, entity_type) seeder, and completed — with the
``sync_complete`` terminal frame + stored result published on the job's own
sync namespace so the original requester's SSE stream closes. A stub seeder
under provider ``fanart`` (never a real engine) captures the raw dict so the
tests assert the raw actually reached the seed layer.
"""

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory

from apps.integrations.models import ClientDevice, SyncJob
from apps.integrations.services import fetch_result
from apps.integrations.tests._sse_fakes import FakeRedis
from apps.integrations.views import FetchRequestStreamView

User = get_user_model()


@override_settings(FANART_API_KEY="")
class FetchDeviceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="device-owner", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_register_creates_and_heartbeats_device(self):
        resp = self.client.post(
            "/api/v1/fetch/device",
            {
                "device_id": "desktop-abc",
                "kind": "desktop",
                "name": "MacBook",
                "provider_keys": {"fanart": {"key": "k"}},
                "capabilities": {"providers": ["fanart"]},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["device_id"], "desktop-abc")
        self.assertTrue(resp.data["online"])
        device = ClientDevice.objects.get(user=self.user, device_id="desktop-abc")
        self.assertEqual(device.kind, "desktop")
        self.assertEqual(device.provider_keys, {"fanart": {"key": "k"}})
        self.assertIsNotNone(device.last_seen)

    def test_register_upserts_same_device_id(self):
        payload = {
            "device_id": "desktop-abc",
            "kind": "desktop",
            "name": "First",
            "capabilities": {"providers": ["fanart"]},
        }
        self.client.post("/api/v1/fetch/device", payload, format="json")
        payload["name"] = "Renamed"
        self.client.post("/api/v1/fetch/device", payload, format="json")
        self.assertEqual(ClientDevice.objects.filter(user=self.user).count(), 1)
        self.assertEqual(ClientDevice.objects.get(user=self.user).name, "Renamed")

    def test_device_id_required(self):
        resp = self.client.post("/api/v1/fetch/device", {}, format="json")
        self.assertEqual(resp.status_code, 400)


class FetchResultTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pw")
        self.stranger = User.objects.create_user(username="stranger", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.fake = FakeRedis()
        self.capture: dict = {}
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch.dict(
                fetch_result._SEEDERS,
                {("fanart", "movie"): self._stub_seeder()},
            ),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    def _stub_seeder(self):
        def seeder(job, raw):
            self.capture["job"] = job
            self.capture["raw"] = raw
            return 42

        return seeder

    def _parked_job(self, **kwargs):
        defaults = {
            "provider": "fanart",
            "entity_type": "movie",
            "external_id": "550",
            "status": "awaiting_client",
            "user": self.owner,
        }
        defaults.update(kwargs)
        return SyncJob.objects.create(**defaults)

    def test_completes_parked_job_from_client_raw(self):
        job = self._parked_job()
        resp = self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "movie",
                "raw": {"title": "Twin Peaks"},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "success")
        self.assertEqual(resp.data["media_id"], 42)

        job.refresh_from_db()
        self.assertEqual(job.status, "completed")
        self.assertIsNotNone(job.completed_at)

        # The raw dict reached the seeder verbatim.
        self.assertEqual(self.capture["raw"], {"title": "Twin Peaks"})

        # sync_complete terminal frame + stored result on the job's namespace.
        channel = f"fanart:sync:{job.pk}:events"
        frames = [json.loads(m) for m in self.fake.published_on(channel)]
        self.assertEqual([f["type"] for f in frames], ["sync_complete"])
        self.assertEqual(frames[0]["resolved_by"], "client")
        self.assertEqual(frames[0]["media_id"], 42)
        stored = self.fake.stored[f"fanart:sync:{job.pk}:result"]
        self.assertIn('"task_id":', stored)
        self.assertIn('"resolved_by":"client"', stored)

    def test_rejects_job_owned_by_another_user(self):
        job = self._parked_job()
        other = APIClient()
        other.force_authenticate(user=self.stranger)
        resp = other.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "movie",
                "raw": {},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
        job.refresh_from_db()
        self.assertEqual(job.status, "awaiting_client")

    def test_rejects_provider_entity_mismatch(self):
        job = self._parked_job()
        resp = self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "show",
                "raw": {},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_rejects_job_not_awaiting_client(self):
        job = self._parked_job(status="completed")
        resp = self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "movie",
                "raw": {},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 409)

    def test_rejects_non_dict_raw_and_bad_task_id(self):
        job = self._parked_job()
        resp = self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "movie",
                "raw": ["not", "a", "dict"],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        resp = self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": "nope",
                "provider": "fanart",
                "entity_type": "movie",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_rejects_entity_without_registered_seeder(self):
        job = self._parked_job(entity_type="episode")
        resp = self.client.post(
            "/api/v1/fetch/result",
            {
                "task_id": str(job.pk),
                "provider": "fanart",
                "entity_type": "episode",
                "raw": {},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("no seeder", resp.data["detail"].lower())
        job.refresh_from_db()
        self.assertEqual(job.status, "awaiting_client")


class FetchStreamTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="stream-owner", password="pw")

    def test_stream_is_persistent_sse_and_touches_device_heartbeat(self):
        ClientDevice.objects.create(
            user=self.user, device_id="desktop-1", kind="desktop", is_active=True
        )  # last_seen stays None until it connects

        request = APIRequestFactory().get("/api/v1/fetch/stream")
        request.user = self.user
        response = FetchRequestStreamView().get(request)

        self.assertEqual(response["Content-Type"], "text/event-stream")
        self.assertTrue(response.streaming)

        device = ClientDevice.objects.get(user=self.user, device_id="desktop-1")
        self.assertIsNotNone(device.last_seen)
        self.assertGreaterEqual(device.last_seen, timezone.now() - timedelta(seconds=5))
