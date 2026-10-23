"""API and service integration tests for the chat app."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.chat.models import MessageReaction
from apps.social.models import FriendRequest

User = get_user_model()


class ChatApiTests(TestCase):
    def setUp(self) -> None:
        self.alice = User.objects.create_user(username="alice", password="password123")
        self.bob = User.objects.create_user(username="bob", password="password123")
        self.charlie = User.objects.create_user(username="charlie", password="password123")

        self.alice_token = Token.objects.create(user=self.alice)
        self.bob_token = Token.objects.create(user=self.bob)
        self.charlie_token = Token.objects.create(user=self.charlie)

        self.alice_client = APIClient()
        self.alice_client.credentials(HTTP_AUTHORIZATION=f"Token {self.alice_token.key}")

        self.bob_client = APIClient()
        self.bob_client.credentials(HTTP_AUTHORIZATION=f"Token {self.bob_token.key}")

        self.charlie_client = APIClient()
        self.charlie_client.credentials(HTTP_AUTHORIZATION=f"Token {self.charlie_token.key}")

        # Establish friendship between Alice and Bob
        FriendRequest.objects.create(sender=self.alice, receiver=self.bob, status="accepted")

    def test_cannot_create_conversation_without_friendship(self) -> None:
        # Alice and Charlie are not friends
        res = self.alice_client.post(
            "/api/v1/chat/conversations",
            {"recipient_id": self.charlie.id},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    @patch("apps.chat.services.chat_service.get_client")
    def test_create_conversation_and_send_message_flow(self, mock_redis_get) -> None:
        fake_redis = MagicMock()
        mock_redis_get.return_value = fake_redis

        # Alice creates conversation with Bob
        res = self.alice_client.post(
            "/api/v1/chat/conversations",
            {"recipient_id": self.bob.id},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        conv_id = res.data["id"]
        self.assertEqual(res.data["type"], "direct")
        self.assertTrue(res.data["is_friend"])

        # Idempotent retrieval of existing direct conversation
        res_repeat = self.bob_client.post(
            "/api/v1/chat/conversations",
            {"recipient_id": self.alice.id},
            format="json",
        )
        self.assertEqual(res_repeat.status_code, 200)
        self.assertEqual(res_repeat.data["id"], conv_id)

        # Alice sends message to Bob
        msg_res = self.alice_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages",
            {
                "content": "Hey Bob! Ready for co-op?",
                "content_type": "text",
            },
            format="json",
        )
        self.assertEqual(msg_res.status_code, 201)
        self.assertIn("id", msg_res.data)
        self.assertEqual(msg_res.data["content"], "Hey Bob! Ready for co-op?")
        self.assertEqual(msg_res.data["sender"]["username"], "alice")

        # Verify Redis publish called for Bob's notifications channel
        self.assertTrue(fake_redis.publish.called)
        channel_arg = fake_redis.publish.call_args[0][0]
        self.assertEqual(channel_arg, f"user:{self.bob.id}:notifications")

        # Bob lists conversations: unread_count should be 1
        bob_convs = self.bob_client.get("/api/v1/chat/conversations")
        self.assertEqual(bob_convs.status_code, 200)
        self.assertEqual(len(bob_convs.data), 1)
        self.assertEqual(bob_convs.data[0]["unread_count"], 1)

        # Bob marks conversation as read
        read_res = self.bob_client.post(f"/api/v1/chat/conversations/{conv_id}/read", format="json")
        self.assertEqual(read_res.status_code, 200)

        # Unread count should now be 0
        bob_convs_after = self.bob_client.get("/api/v1/chat/conversations")
        self.assertEqual(bob_convs_after.data[0]["unread_count"], 0)

    @patch("apps.chat.services.chat_service.get_client")
    def test_message_edit_and_soft_delete(self, mock_redis_get) -> None:
        fake_redis = MagicMock()
        mock_redis_get.return_value = fake_redis

        # Setup conversation and message
        res = self.alice_client.post(
            "/api/v1/chat/conversations",
            {"recipient_id": self.bob.id},
            format="json",
        )
        conv_id = res.data["id"]

        msg = self.alice_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages",
            {"content": "Original message"},
            format="json",
        )
        msg_id = msg.data["id"]

        # Bob cannot edit Alice's message
        bob_edit = self.bob_client.patch(
            f"/api/v1/chat/conversations/{conv_id}/messages/{msg_id}",
            {"content": "Hacked content"},
            format="json",
        )
        self.assertEqual(bob_edit.status_code, 403)

        # Alice edits her message
        alice_edit = self.alice_client.patch(
            f"/api/v1/chat/conversations/{conv_id}/messages/{msg_id}",
            {"content": "Edited message content"},
            format="json",
        )
        self.assertEqual(alice_edit.status_code, 200)
        self.assertEqual(alice_edit.data["content"], "Edited message content")
        self.assertIsNotNone(alice_edit.data["edited_at"])

        # Alice soft-deletes her message
        delete_res = self.alice_client.delete(
            f"/api/v1/chat/conversations/{conv_id}/messages/{msg_id}",
        )
        self.assertEqual(delete_res.status_code, 200)
        self.assertTrue(delete_res.data["is_deleted"])
        self.assertEqual(delete_res.data["content"], "")

    @patch("apps.chat.services.chat_service.get_client")
    def test_reaction_toggle_and_typing(self, mock_redis_get) -> None:
        fake_redis = MagicMock()
        mock_redis_get.return_value = fake_redis

        res = self.alice_client.post(
            "/api/v1/chat/conversations",
            {"recipient_id": self.bob.id},
            format="json",
        )
        conv_id = res.data["id"]

        msg = self.alice_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages",
            {"content": "Check this out!"},
            format="json",
        )
        msg_id = msg.data["id"]

        # Bob adds reaction 👍
        react_res = self.bob_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages/{msg_id}/reactions",
            {"emoji": "👍"},
            format="json",
        )
        self.assertEqual(react_res.status_code, 200)
        self.assertTrue(react_res.data["added"])
        self.assertEqual(MessageReaction.objects.filter(message_id=msg_id).count(), 1)
        self.assertEqual(MessageReaction.objects.filter(message_id=msg_id, user=self.bob).first().emoji, "👍")

        # Bob switches reaction to ❤️ (should replace, not add a second reaction)
        react_swap = self.bob_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages/{msg_id}/reactions",
            {"emoji": "❤️"},
            format="json",
        )
        self.assertEqual(react_swap.status_code, 200)
        self.assertTrue(react_swap.data["added"])
        self.assertEqual(MessageReaction.objects.filter(message_id=msg_id).count(), 1)
        self.assertEqual(MessageReaction.objects.filter(message_id=msg_id, user=self.bob).first().emoji, "❤️")

        # Bob toggles same reaction off
        react_remove = self.bob_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages/{msg_id}/reactions",
            {"emoji": "❤️"},
            format="json",
        )
        self.assertEqual(react_remove.status_code, 200)
        self.assertFalse(react_remove.data["added"])
        self.assertEqual(MessageReaction.objects.filter(message_id=msg_id).count(), 0)

        # Alice broadcasts typing
        typing_res = self.alice_client.post(
            f"/api/v1/chat/conversations/{conv_id}/typing",
            format="json",
        )
        self.assertEqual(typing_res.status_code, 200)
        self.assertEqual(typing_res.data["status"], "ok")

    @patch("apps.chat.services.chat_service.get_client")
    def test_unfriended_conversation_becomes_readonly(self, mock_redis_get) -> None:
        fake_redis = MagicMock()
        mock_redis_get.return_value = fake_redis

        # Conversation created while friends
        res = self.alice_client.post(
            "/api/v1/chat/conversations",
            {"recipient_id": self.bob.id},
            format="json",
        )
        conv_id = res.data["id"]

        # Alice sends initial message
        self.alice_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages",
            {"content": "Hello before unfriend"},
            format="json",
        )

        # They unfriend each other
        FriendRequest.objects.filter(sender=self.alice, receiver=self.bob).delete()

        # Alice can still view conversation details and message history
        detail_res = self.alice_client.get(f"/api/v1/chat/conversations/{conv_id}")
        self.assertEqual(detail_res.status_code, 200)
        self.assertFalse(detail_res.data["is_friend"])

        history_res = self.alice_client.get(f"/api/v1/chat/conversations/{conv_id}/messages")
        self.assertEqual(history_res.status_code, 200)
        self.assertEqual(len(history_res.data), 1)

        # But new message is blocked with 403 FriendshipRequiredError
        new_msg = self.alice_client.post(
            f"/api/v1/chat/conversations/{conv_id}/messages",
            {"content": "Trying to message after unfriend"},
            format="json",
        )
        self.assertEqual(new_msg.status_code, 403)
