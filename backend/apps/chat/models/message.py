"""Message, reaction, and attachment models for user chat."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.chat.models.conversation import Conversation
from core.models import TimestampedModel

MESSAGE_CONTENT_TYPE_CHOICES = (
    ("text", "Text"),
    ("entity_embed", "Entity Embed"),
    ("attachment", "Attachment"),
)


class Message(TimestampedModel):
    """An individual message sent within a conversation."""

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_chat_messages",
    )
    content = models.TextField(blank=True, default="")
    content_type = models.CharField(
        max_length=32,
        choices=MESSAGE_CONTENT_TYPE_CHOICES,
        default="text",
    )
    metadata = models.JSONField(default=dict, blank=True)
    is_deleted = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "chat_messages"
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=["conversation", "created_at"], name="ix_chat_msg_conv_created"),
            models.Index(fields=["conversation", "id"], name="ix_chat_msg_conv_id"),
        ]

    def __str__(self) -> str:
        return f"Message({self.id}, conv={self.conversation_id}, sender={self.sender_id})"


class MessageAttachment(TimestampedModel):
    """A file or media asset associated with a chat message."""

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file_name = models.CharField(max_length=255)
    file_url = models.CharField(max_length=1024)
    content_type = models.CharField(max_length=128, blank=True, default="")
    file_size = models.BigIntegerField(default=0)

    class Meta(TimestampedModel.Meta):
        db_table = "chat_message_attachments"
        ordering = ("created_at", "id")

    def __str__(self) -> str:
        return f"Attachment({self.id}, file={self.file_name})"


class MessageReaction(TimestampedModel):
    """An emoji reaction applied to a message by a user."""

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_reactions",
    )
    emoji = models.CharField(max_length=32)

    class Meta(TimestampedModel.Meta):
        db_table = "chat_message_reactions"
        constraints = [
            models.UniqueConstraint(
                fields=["message", "user"],
                name="uq_chat_msg_user_reaction",
            ),
        ]
        indexes = [
            models.Index(fields=["message", "emoji"], name="ix_chat_react_msg_emoji"),
        ]

    def __str__(self) -> str:
        return f"Reaction({self.emoji} by {self.user_id} on {self.message_id})"
