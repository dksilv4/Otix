"""Tests for notification Redis SSE fan-out (``apps.social.services.realtime``)."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.social.models import Notification
from apps.social.services.realtime import (
    notification_channel,
    notification_sse_payload,
    publish_notification,
)

User = get_user_model()


class _FakeRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []

    def publish(self, channel: str, payload: str) -> int:
        self.published.append((channel, payload))
        return 1


class NotificationRealtimeTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="dave", password="pw")

    def test_payload_matches_notification_out_shape(self) -> None:
        notif = Notification.objects.create(
            user=self.user,
            type="follow",
            title="New Follower",
            body="bob started following you",
            metadata_json={"follower_username": "bob"},
        )
        payload = notification_sse_payload(notif)
        self.assertEqual(payload["id"], notif.id)
        self.assertEqual(payload["type"], "follow")
        self.assertEqual(payload["title"], "New Follower")
        self.assertEqual(payload["body"], "bob started following you")
        self.assertEqual(payload["metadata_json"], {"follower_username": "bob"})
        self.assertFalse(payload["is_read"])
        self.assertIsNotNone(payload["created_at"])

    def test_publish_writes_to_user_channel(self) -> None:
        notif = Notification.objects.create(
            user=self.user, type="system", title="Hi", body="body"
        )
        fake = _FakeRedis()
        with mock.patch("apps.social.services.realtime.get_client", return_value=fake):
            publish_notification(notif)
        self.assertEqual(len(fake.published), 1)
        channel, raw = fake.published[0]
        self.assertEqual(channel, notification_channel(self.user.id))
        self.assertIn('"type":"system"', raw)
        self.assertIn(f'"id":{notif.id}', raw)

    def test_create_publishes_after_commit(self) -> None:
        fake = _FakeRedis()
        with mock.patch("apps.social.services.realtime.get_client", return_value=fake):
            with self.captureOnCommitCallbacks(execute=True):
                notif = Notification.objects.create(
                    user=self.user, type="friend_request", title="Req"
                )
        self.assertEqual(len(fake.published), 1)
        self.assertEqual(fake.published[0][0], notification_channel(self.user.id))
        self.assertIn(f'"id":{notif.id}', fake.published[0][1])

    @mock.patch("apps.social.signals.send_notification")
    def test_create_sends_web_push_after_commit(self, send) -> None:
        with self.captureOnCommitCallbacks(execute=True):
            notif = Notification.objects.create(
                user=self.user, type="friend_request", title="Req"
            )
        send.assert_called_once_with(notif)

    def test_update_does_not_republish(self) -> None:
        notif = Notification.objects.create(
            user=self.user, type="system", title="Hi"
        )
        fake = _FakeRedis()
        with mock.patch("apps.social.services.realtime.get_client", return_value=fake):
            with self.captureOnCommitCallbacks(execute=True):
                notif.is_read = True
                notif.save(update_fields=["is_read"])
        self.assertEqual(fake.published, [])

    def test_publish_failure_is_swallowed(self) -> None:
        notif = Notification.objects.create(
            user=self.user, type="system", title="Hi"
        )

        class _Boom:
            def publish(self, *_a, **_k):
                raise RuntimeError("redis down")

        with mock.patch("apps.social.services.realtime.get_client", return_value=_Boom()):
            publish_notification(notif)  # must not raise
