#!/usr/bin/env python3
"""Script to automatically add admin / primary user as friend and send a test message.

Usage:
    docker compose exec api python scripts/send_test_message.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django
django.setup()

from django.contrib.auth import get_user_model
from apps.social.models import FriendRequest
from apps.chat.services import get_or_create_direct_conversation, send_message

User = get_user_model()


def send_to_user(test_user, recipient):
    print(f"\n==========================================")
    print(f"👤 Processing recipient: @{recipient.username} (ID: {recipient.id})")

    # 1. Establish accepted friendship
    friend_edge = FriendRequest.objects.filter(
        sender__in=[test_user, recipient],
        receiver__in=[test_user, recipient],
    ).first()

    if not friend_edge:
        friend_edge = FriendRequest.objects.create(
            sender=test_user,
            receiver=recipient,
            status="accepted",
        )
        print(f"🤝 Established new accepted friendship between @{test_user.username} and @{recipient.username}!")
    else:
        if friend_edge.status != "accepted":
            friend_edge.status = "accepted"
            friend_edge.save(update_fields=["status"])
            print(f"🤝 Updated existing friendship to accepted between @{test_user.username} and @{recipient.username}!")
        else:
            print(f"🤝 Friendship already active between @{test_user.username} and @{recipient.username}.")

    # 2. Get or create direct conversation
    conversation, conv_created = get_or_create_direct_conversation(
        user_a_id=test_user.id,
        user_b_id=recipient.id,
    )
    print(f"💬 Conversation ID: {conversation.id} (New: {conv_created})")

    # 3. Send message from test account
    content = f"Hey @{recipient.username}! 👋 I just added you as a friend on Otix. The new chat integration inside the right nav pill is active and ready to test!"
    msg = send_message(
        conversation_id=conversation.id,
        sender_id=test_user.id,
        content=content,
        content_type="text",
    )
    print(f"🚀 Sent message ID {msg.id}: '{msg.content}'")
    print(f"✅ Real-time SSE notification dispatched to channel user:{recipient.id}:notifications.")


def main():
    # Find or create test account
    test_user, created = User.objects.get_or_create(
        username="otix_bot",
        defaults={
            "display_name": "Otix Companion",
            "email": "bot@otix.local",
            "is_active": True,
        },
    )
    if created:
        test_user.set_password("password123")
        test_user.save()
        print(f"✨ Created test user: {test_user.username} (ID: {test_user.id})")
    else:
        print(f"👥 Using test user: {test_user.username} (ID: {test_user.id})")

    # Target users: admin, DiogoSilva, worker
    target_usernames = ["admin", "DiogoSilva", "worker"]
    recipients = list(User.objects.filter(username__in=target_usernames))

    if not recipients:
        admin_fallback = User.objects.filter(is_superuser=True).first() or User.objects.exclude(id=test_user.id).first()
        if admin_fallback:
            recipients = [admin_fallback]

    for recipient in recipients:
        send_to_user(test_user, recipient)


if __name__ == "__main__":
    main()
