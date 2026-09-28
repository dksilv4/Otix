"""Tests for web-push delivery (``apps.push.services.sender``).

``pywebpush`` is patched at its module attributes (the sender imports it lazily
inside the call); the VAPID private-key helper is patched so no environment or
real keypair is needed. Covers the unconfigured no-op, the missing-dependency
no-op, a successful send, and pruning of an endpoint the push service retired.
"""

from __future__ import annotations

import sys
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.push.models import PushSubscription
from apps.push.services.sender import send_notification
from apps.social.models import Notification

User = get_user_model()


class _FakeWebPushError(Exception):
    """Stand-in for ``pywebpush.WebPushException`` carrying the HTTP response."""

    def __init__(self, response=None):
        super().__init__("web push failed")
        self.response = response


class SendNotificationTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.notification = Notification.objects.create(
            user=self.user, type="studio_release", title="New from A24", body="Title"
        )

    def _subscription(self, endpoint: str = "https://push.example/abc") -> PushSubscription:
        return PushSubscription.objects.create(
            user=self.user, endpoint=endpoint, p256dh_key="p", auth_key="a"
        )

    def test_unconfigured_key_is_noop(self) -> None:
        self._subscription()
        with (
            mock.patch("apps.push.services.sender.get_vapid_private_key", return_value=""),
            mock.patch("pywebpush.webpush") as webpush,
        ):
            self.assertEqual(send_notification(self.notification), 0)
            webpush.assert_not_called()

    def test_missing_dependency_is_noop(self) -> None:
        self._subscription()
        with (
            mock.patch("apps.push.services.sender.get_vapid_private_key", return_value="priv"),
            mock.patch.dict(sys.modules, {"pywebpush": None}),
        ):
            self.assertEqual(send_notification(self.notification), 0)

    def test_successful_send(self) -> None:
        self._subscription()
        with (
            mock.patch("apps.push.services.sender.get_vapid_private_key", return_value="priv"),
            mock.patch("pywebpush.webpush") as webpush,
        ):
            self.assertEqual(send_notification(self.notification), 1)
            webpush.assert_called_once()
            self.assertEqual(PushSubscription.objects.count(), 1)

    def test_expired_endpoint_is_pruned(self) -> None:
        self._subscription()
        error = _FakeWebPushError(response=mock.Mock(status_code=410))
        with (
            mock.patch("apps.push.services.sender.get_vapid_private_key", return_value="priv"),
            mock.patch("pywebpush.webpush", side_effect=error),
            mock.patch("pywebpush.WebPushException", _FakeWebPushError),
        ):
            self.assertEqual(send_notification(self.notification), 0)
            self.assertEqual(PushSubscription.objects.count(), 0)

    def test_failed_send_keeps_subscription(self) -> None:
        self._subscription()
        error = _FakeWebPushError(response=mock.Mock(status_code=500))
        with (
            mock.patch("apps.push.services.sender.get_vapid_private_key", return_value="priv"),
            mock.patch("pywebpush.webpush", side_effect=error),
            mock.patch("pywebpush.WebPushException", _FakeWebPushError),
        ):
            self.assertEqual(send_notification(self.notification), 0)
            self.assertEqual(PushSubscription.objects.count(), 1)
