"""Serializers for chat conversations and participants."""

from __future__ import annotations

from django.db.models import Q
from rest_framework import serializers

from apps.chat.models import Conversation, ConversationParticipant, Message
from apps.chat.serializers.message import ChatUserSummarySerializer, MessageSerializer
from apps.social.models import FriendRequest


class ConversationParticipantSerializer(serializers.ModelSerializer):
    """Output serializer for a participant inside a conversation."""

    user = ChatUserSummarySerializer(read_only=True)

    class Meta:
        model = ConversationParticipant
        fields = [
            "id",
            "user",
            "joined_at",
            "last_read_at",
            "last_read_message_id",
            "is_muted",
            "is_archived",
        ]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    """Output serializer for conversations in lists and detail views."""

    participants = ConversationParticipantSerializer(many=True, read_only=True)
    partner = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_friend = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "type",
            "title",
            "created_at",
            "updated_at",
            "partner",
            "participants",
            "last_message",
            "unread_count",
            "is_friend",
        ]
        read_only_fields = fields

    def _get_request_user(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    def get_partner(self, obj: Conversation) -> dict | None:
        user = self._get_request_user()
        if not user or obj.type != "direct":
            return None

        for p in obj.participants.all():
            if p.user_id != user.id:
                return ChatUserSummarySerializer(p.user).data
        return None

    def _get_friend_ids(self) -> set[int]:
        if "_friend_ids" not in self.context:
            user = self._get_request_user()
            if not user:
                self.context["_friend_ids"] = set()
            else:
                friend_pairs = FriendRequest.objects.filter(
                    Q(sender_id=user.id) | Q(receiver_id=user.id),
                    status="accepted",
                ).values_list("sender_id", "receiver_id")
                self.context["_friend_ids"] = {
                    r if s == user.id else s for s, r in friend_pairs
                }
        return self.context["_friend_ids"]

    def get_is_friend(self, obj: Conversation) -> bool:
        user = self._get_request_user()
        if not user or obj.type != "direct":
            return True

        friend_ids = self._get_friend_ids()
        for p in obj.participants.all():
            if p.user_id != user.id:
                return p.user_id in friend_ids
        return False

    def get_last_message(self, obj: Conversation) -> dict | None:
        # If prefetched or cached
        msgs = list(obj.messages.all())
        if msgs:
            # Newest message
            newest = msgs[-1] if msgs[0].created_at <= msgs[-1].created_at else msgs[0]
            return MessageSerializer(newest).data
        # Fallback query if messages not prefetched
        latest = Message.objects.filter(conversation=obj).order_by("-id").first()
        return MessageSerializer(latest).data if latest else None

    def get_unread_count(self, obj: Conversation) -> int:
        if hasattr(obj, "unread_count") and obj.unread_count is not None:
            return obj.unread_count

        user = self._get_request_user()
        if not user:
            return 0

        caller_part = None
        for p in obj.participants.all():
            if p.user_id == user.id:
                caller_part = p
                break

        last_id = caller_part.last_read_message_id if caller_part else None

        prefetched_msgs = getattr(obj, "_prefetched_objects_cache", {}).get("messages")
        if prefetched_msgs is not None:
            count = 0
            for m in prefetched_msgs:
                if m.sender_id != user.id:
                    if not last_id or m.id > last_id:
                        count += 1
            obj.unread_count = count
            return count

        qs = Message.objects.filter(conversation=obj).exclude(sender_id=user.id)
        if last_id:
            qs = qs.filter(id__gt=last_id)
        count = qs.count()
        obj.unread_count = count
        return count


class ConversationCreateInputSerializer(serializers.Serializer):
    """Input serializer for starting a direct conversation."""

    recipient_id = serializers.IntegerField(required=True)


class ConversationSettingsInputSerializer(serializers.Serializer):
    """Input serializer for updating participant preferences."""

    is_muted = serializers.BooleanField(required=False)
    is_archived = serializers.BooleanField(required=False)
