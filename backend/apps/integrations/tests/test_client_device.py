"""ClientDevice model: registration, key capability, online freshness, uniqueness."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from apps.integrations.models import ClientDevice
from apps.integrations.models.client import ONLINE_TTL_SECONDS

User = get_user_model()


class ClientDeviceModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="device-owner", password="pw")

    def _device(self, **kwargs):
        defaults = {
            "user": self.user,
            "device_id": "desktop-abc123",
            "kind": "desktop",
            "name": "DK's MacBook",
            "provider_keys": {"tmdb": {"key": "k"}, "musicbrainz": {}},
            "capabilities": {"providers": ["tmdb", "musicbrainz"]},
        }
        defaults.update(kwargs)
        return ClientDevice.objects.create(**defaults)

    def test_str_and_storage(self):
        device = self._device()
        self.assertEqual(
            str(device), f"DK's MacBook ({self.user.pk})"
        )
        self.assertIsNone(device.last_seen)
        self.assertTrue(device.is_active)

    def test_online_refreshes_on_touch(self):
        device = self._device()
        self.assertFalse(device.online)  # never seen
        device.touch()
        self.assertTrue(device.online)
        # Stale heartbeat beyond the freshness window flips it offline.
        ClientDevice.objects.filter(pk=device.pk).update(
            last_seen=timezone.now() - timedelta(seconds=ONLINE_TTL_SECONDS + 10)
        )
        self.assertFalse(ClientDevice.objects.get(pk=device.pk).online)

    def test_can_fetch_requires_key_capability_online_active(self):
        device = self._device()
        device.touch()
        # Capability + key → fetchable.
        self.assertTrue(device.can_fetch("tmdb"))
        # Capable + online but no key on this device → not fetchable.
        self.assertFalse(device.can_fetch("musicbrainz"))
        # Keyed but not in the capability list → not offered.
        self.assertFalse(device.can_fetch("igdb"))
        # Everything set but the device was deactivated.
        device.is_active = False
        self.assertFalse(device.can_fetch("tmdb"))

    def test_has_provider_key_is_existence_not_emptiness(self):
        device = self._device()
        self.assertTrue(device.has_provider_key("tmdb"))
        self.assertFalse(device.has_provider_key("musicbrainz"))

    def test_unique_per_user_device_id(self):
        self._device()
        with self.assertRaises(IntegrityError):
            self._device()  # same user + device_id

    def test_same_device_id_under_different_users_is_allowed(self):
        other = User.objects.create_user(username="other-owner", password="pw")
        self._device()
        device = self._device(user=other)
        self.assertEqual(ClientDevice.objects.count(), 2)
        self.assertNotEqual(device.user_id, self.user.pk)
