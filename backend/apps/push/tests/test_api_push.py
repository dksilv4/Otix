"""Endpoint tests for the push API area (VAPID key, subscribe, unsubscribe).

Exercises the ported legacy routes against a real test database: the public
``GET /api/v1/push/vapid-public-key`` and the authenticated
``POST``/``DELETE /api/v1/push/subscribe``. Status codes mirror the legacy
FastAPI router (``old-backend/otix/api/push/router.py``): vapid 200, subscribe 201,
unsubscribe 200 with the legacy ``message`` bodies.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.push.models import PushSubscription

User = get_user_model()

ENDPOINT = "https://push.example.com/some-token"
P256DH = "public-ecdsa-key"
AUTH = "shared-secret"

# Wire format for the API request bodies (legacy uses p256dh/auth key names).
SUBSCRIPTION = {"endpoint": ENDPOINT, "p256dh": P256DH, "auth": AUTH}


class PushApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.public = APIClient()

    def _create_subscription(
        self,
        user,
        *,
        endpoint: str = ENDPOINT,
        p256dh: str = P256DH,
        auth: str = AUTH,
    ) -> PushSubscription:
        return PushSubscription.objects.create(
            user=user, endpoint=endpoint, p256dh_key=p256dh, auth_key=auth
        )

    def test_vapid_public_key_is_public_200(self) -> None:
        response = self.public.get("/api/v1/push/vapid-public-key")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"public_key"})
        self.assertIsInstance(response.data["public_key"], str)
        self.assertTrue(response.data["public_key"])

    def test_subscribe_creates_subscription_201(self) -> None:
        response = self.client.post(
            "/api/v1/push/subscribe", SUBSCRIPTION, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data, {"message": "Subscribed"})

        sub = PushSubscription.objects.get(user=self.user)
        self.assertEqual(sub.endpoint, ENDPOINT)
        self.assertEqual(sub.p256dh_key, P256DH)
        self.assertEqual(sub.auth_key, AUTH)

    def test_subscribe_upserts_same_endpoint(self) -> None:
        self.client.post("/api/v1/push/subscribe", SUBSCRIPTION, format="json")
        refreshed = {**SUBSCRIPTION, "p256dh": "new-public-key", "auth": "new-secret"}
        response = self.client.post(
            "/api/v1/push/subscribe", refreshed, format="json"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(PushSubscription.objects.filter(user=self.user).count(), 1)
        sub = PushSubscription.objects.get(user=self.user)
        self.assertEqual(sub.p256dh_key, "new-public-key")
        self.assertEqual(sub.auth_key, "new-secret")

    def test_subscribe_requires_authentication(self) -> None:
        response = self.public.post(
            "/api/v1/push/subscribe", SUBSCRIPTION, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_subscribe_rejects_missing_fields(self) -> None:
        response = self.client.post(
            "/api/v1/push/subscribe", {"endpoint": ENDPOINT}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_unsubscribe_removes_matching_subscription_200(self) -> None:
        self._create_subscription(self.user)

        response = self.client.delete(
            "/api/v1/push/subscribe", {"endpoint": ENDPOINT}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"message": "Unsubscribed"})
        self.assertFalse(PushSubscription.objects.filter(user=self.user).exists())

    def test_unsubscribe_without_matching_row_is_200_noop(self) -> None:
        response = self.client.delete(
            "/api/v1/push/subscribe", {"endpoint": ENDPOINT}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"message": "Unsubscribed"})

    def test_unsubscribe_only_removes_matching_endpoint(self) -> None:
        other_endpoint = "https://push.example.com/other-token"
        self._create_subscription(self.user)
        self._create_subscription(self.user, endpoint=other_endpoint)

        response = self.client.delete(
            "/api/v1/push/subscribe", {"endpoint": ENDPOINT}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        remaining = PushSubscription.objects.filter(user=self.user).values_list(
            "endpoint", flat=True
        )
        self.assertEqual(list(remaining), [other_endpoint])

    def test_unsubscribe_is_scoped_to_current_user(self) -> None:
        self._create_subscription(self.user)
        self._create_subscription(self.other)

        response = self.client.delete(
            "/api/v1/push/subscribe", {"endpoint": ENDPOINT}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(PushSubscription.objects.filter(user=self.user).exists())
        self.assertTrue(PushSubscription.objects.filter(user=self.other).exists())

    def test_unsubscribe_requires_authentication(self) -> None:
        response = self.public.delete(
            "/api/v1/push/subscribe", {"endpoint": ENDPOINT}, format="json"
        )
        self.assertEqual(response.status_code, 401)
