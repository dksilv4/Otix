"""Model round-trip smoke tests for the push app."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.push.models import PushSubscription

User = get_user_model()


class PushSubscriptionRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="subscriber", password="x")

    def test_push_subscription_roundtrip(self) -> None:
        sub = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://push.example.com/some-token",
            p256dh_key="public-ecdsa-key",
            auth_key="shared-secret",
        )

        self.assertEqual(list(self.user.push_subscriptions.all()), [sub])
        self.assertEqual(sub.user, self.user)
        self.assertIsNotNone(sub.created_at)
