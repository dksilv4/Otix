"""Serializers for chat messages, reactions, and attachments."""

from __future__ import annotations

from rest_framework import serializers

from apps.chat.models import Message, MessageAttachment, MessageReaction
from core.image_url import clean_image_url


class ChatUserSummarySerializer(serializers.Serializer):
    """Compact user representation for chat senders and participants."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True, allow_blank=True, default="")
    avatar_url = serializers.CharField(read_only=True, allow_null=True)

    def to_representation(self, instance) -> dict:
        data = super().to_representation(instance)
        if data.get("avatar_url"):
            data["avatar_url"] = clean_image_url(data["avatar_url"])
        return data


class MessageAttachmentSerializer(serializers.ModelSerializer):
    """Output serializer for message file/media attachments."""

    class Meta:
        model = MessageAttachment
        fields = [
            "id",
            "file_name",
            "file_url",
            "content_type",
            "file_size",
            "created_at",
        ]
        read_only_fields = fields


class MessageReactionSerializer(serializers.ModelSerializer):
    """Output serializer for emoji reactions."""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = MessageReaction
        fields = [
            "id",
            "user_id",
            "username",
            "emoji",
            "created_at",
        ]
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    """Output serializer for individual chat messages."""

    sender = ChatUserSummarySerializer(read_only=True)
    conversation_id = serializers.UUIDField(source="conversation.id", read_only=True)
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    reactions = MessageReactionSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation_id",
            "sender",
            "content",
            "content_type",
            "metadata",
            "is_deleted",
            "edited_at",
            "created_at",
            "attachments",
            "reactions",
        ]
        read_only_fields = fields

    def to_representation(self, instance: Message) -> dict:
        data = super().to_representation(instance)
        # If soft-deleted, redact the content for privacy
        if instance.is_deleted:
            data["content"] = ""
            data["metadata"] = {}
        return data


class MessageSendInputSerializer(serializers.Serializer):
    """Input serializer for sending a chat message."""

    content = serializers.CharField(required=False, allow_blank=True, default="")
    content_type = serializers.ChoiceField(
        choices=["text", "entity_embed", "attachment"],
        default="text",
        required=False,
    )
    metadata = serializers.DictField(required=False, default=dict)
    attachments = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )


class MessageEditInputSerializer(serializers.Serializer):
    """Input serializer for editing an existing message."""

    content = serializers.CharField(required=True, allow_blank=False)


class MessageReactionInputSerializer(serializers.Serializer):
    """Input serializer for toggling an emoji reaction."""

    emoji = serializers.CharField(required=True, max_length=32)
