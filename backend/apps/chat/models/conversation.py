"""Conversation and participant models for user messaging."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

CONVERSATION_TYPE_CHOICES = (
    ("direct", "Direct"),
    ("group", "Group"),
)


class Conversation(TimestampedModel):
    """A messaging thread between two or more participants."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(
        max_length=16,
        choices=CONVERSATION_TYPE_CHOICES,
        default="direct",
        db_index=True,
    )
    title = models.CharField(max_length=255, blank=True, default="")

    class Meta(TimestampedModel.Meta):
        db_table = "chat_conversations"
        ordering = ("-updated_at",)

    def __str__(self) -> str:
        return f"Conversation({self.id}, type={self.type})"


class ConversationParticipant(TimestampedModel):
    """Membership and reading state for a user inside a conversation."""

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_participants",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)
    last_read_message_id = models.BigIntegerField(null=True, blank=True)
    is_muted = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        db_table = "chat_conversation_participants"
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"],
                name="uq_chat_conv_participant",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "is_archived"], name="ix_chat_part_user_archived"),
            models.Index(fields=["conversation", "user"], name="ix_chat_part_conv_user"),
        ]

    def __str__(self) -> str:
        return f"Participant(user={self.user_id}, conv={self.conversation_id})"
