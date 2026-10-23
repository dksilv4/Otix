"""Service layer for chat conversations, messages, reactions, and realtime fan-out."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.chat.models import (
    Conversation,
    ConversationParticipant,
    Message,
    MessageAttachment,
    MessageReaction,
)
from apps.social.models import FriendRequest
from core.redis import get_client

logger = logging.getLogger(__name__)
User = get_user_model()


class FriendshipRequiredError(PermissionDenied):
    default_detail = "Messaging requires an active friendship."
    default_code = "friendship_required"


def are_friends(user_a_id: int, user_b_id: int) -> bool:
    """Return True if user_a and user_b have an accepted friendship."""
    return FriendRequest.objects.filter(
        (Q(sender_id=user_a_id, receiver_id=user_b_id) | Q(sender_id=user_b_id, receiver_id=user_a_id)),
        status="accepted",
    ).exists()


def publish_chat_event(target_user_id: int, event_type: str, data: dict[str, Any]) -> None:
    """Publish a chat realtime event to the user's notifications SSE stream."""
    channel = f"user:{target_user_id}:notifications"
    # Format matches Notification SSE payload shape so the existing useSseStream
    # and notifications provider process it smoothly.
    payload = {
        "id": f"chat_{uuid.uuid4().hex[:12]}",
        "type": event_type,
        "title": data.get("title", "New message"),
        "body": data.get("snippet", ""),
        "metadata_json": data,
        "is_read": False,
        "created_at": timezone.now().isoformat(),
    }
    raw = json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))
    try:
        get_client().publish(channel, raw)
    except Exception:
        # Fail-open: realtime publish failure must never abort durable DB writes.
        logger.exception("Failed to publish chat SSE event to %s", channel)


def get_or_create_direct_conversation(
    user_a_id: int,
    user_b_id: int,
) -> tuple[Conversation, bool]:
    """Retrieve an existing direct conversation or create a new one between two friends."""
    if user_a_id == user_b_id:
        raise ValidationError("Cannot start a conversation with yourself.")

    if not User.objects.filter(id=user_b_id).exists():
        raise NotFound("Target user does not exist.")

    # Find existing 1-on-1 direct conversation with both participants
    shared_conv = (
        Conversation.objects.filter(type="direct")
        .filter(participants__user_id=user_a_id)
        .filter(participants__user_id=user_b_id)
        .first()
    )
    if shared_conv:
        return shared_conv, False

    # To create a new direct conversation, an active friendship is mandatory
    if not are_friends(user_a_id, user_b_id):
        raise FriendshipRequiredError()

    with transaction.atomic():
        conv = Conversation.objects.create(type="direct")
        ConversationParticipant.objects.create(conversation=conv, user_id=user_a_id)
        ConversationParticipant.objects.create(conversation=conv, user_id=user_b_id)

    return conv, True


def get_total_unread_count(user_id: int) -> int:
    """Return total count of unread messages across all active conversations for user_id."""
    return (
        Message.objects.filter(
            conversation__participants__user_id=user_id,
            conversation__participants__is_archived=False,
            is_deleted=False,
        )
        .exclude(sender_id=user_id)
        .filter(
            Q(conversation__participants__last_read_message_id__isnull=True)
            | Q(id__gt=F("conversation__participants__last_read_message_id"))
        )
        .distinct()
        .count()
    )


def list_conversations_for_user(user_id: int, limit: int | None = None):
    """List active conversations for user with participant & unread annotations."""
    qs = (
        Conversation.objects.filter(
            participants__user_id=user_id,
            participants__is_archived=False,
        )
        .prefetch_related(
            "participants",
            "participants__user",
            "messages",
            "messages__sender",
        )
        .order_by("-updated_at")
    )
    if limit is not None:
        qs = qs[:limit]
    return qs


def get_conversation_for_user(conversation_id: str | uuid.UUID, user_id: int) -> Conversation:
    """Retrieve a conversation ensuring the requesting user is a participant."""
    conv = (
        Conversation.objects.filter(id=conversation_id)
        .prefetch_related("participants", "participants__user")
        .first()
    )
    if not conv:
        raise NotFound("Conversation not found.")

    is_participant = conv.participants.filter(user_id=user_id).exists()
    if not is_participant:
        raise PermissionDenied("You are not a participant in this conversation.")

    return conv


def list_messages(
    conversation_id: str | uuid.UUID,
    user_id: int,
    limit: int = 50,
    before_id: int | None = None,
):
    """Fetch paginated message history for a conversation."""
    get_conversation_for_user(conversation_id, user_id)

    qs = (
        Message.objects.filter(conversation_id=conversation_id)
        .select_related("sender")
        .prefetch_related("reactions", "reactions__user", "attachments")
    )
    if before_id:
        qs = qs.filter(id__lt=before_id)

    # Order newest first for slicing, then reverse to chronological order
    messages = list(qs.order_by("-created_at", "-id")[:limit])
    messages.reverse()
    return messages


def send_message(
    conversation_id: str | uuid.UUID,
    sender_id: int,
    content: str,
    content_type: str = "text",
    metadata: dict | None = None,
    attachments_data: list[dict] | None = None,
) -> Message:
    """Send a message within a conversation and dispatch realtime notifications."""
    conv = get_conversation_for_user(conversation_id, sender_id)

    # If this is a direct conversation, verify friendship before allowing new messages
    if conv.type == "direct":
        partner_participant = conv.participants.exclude(user_id=sender_id).first()
        if partner_participant and not are_friends(sender_id, partner_participant.user_id):
            raise FriendshipRequiredError("Cannot send message: you and this user are no longer friends.")

    stripped_content = content.strip() if content else ""
    if not stripped_content and not attachments_data and not metadata:
        raise ValidationError("Message cannot be empty.")

    with transaction.atomic():
        message = Message.objects.create(
            conversation=conv,
            sender_id=sender_id,
            content=stripped_content,
            content_type=content_type,
            metadata=metadata or {},
        )

        if attachments_data:
            for item in attachments_data:
                MessageAttachment.objects.create(
                    message=message,
                    file_name=item.get("file_name", "attachment"),
                    file_url=item.get("file_url", ""),
                    content_type=item.get("content_type", ""),
                    file_size=item.get("file_size", 0),
                )

        # Update conversation updated_at
        conv.updated_at = timezone.now()
        conv.save(update_fields=["updated_at"])

        # Update sender's last_read_message_id
        ConversationParticipant.objects.filter(
            conversation=conv,
            user_id=sender_id,
        ).update(
            last_read_message_id=message.id,
            last_read_at=timezone.now(),
        )

    # Fan out realtime event to all other participants
    other_participants = conv.participants.exclude(user_id=sender_id).select_related("user")
    sender = message.sender
    for participant in other_participants:
        publish_chat_event(
            target_user_id=participant.user_id,
            event_type="chat.message_created",
            data={
                "conversation_id": str(conv.id),
                "message_id": message.id,
                "sender_id": sender.id,
                "sender_username": sender.username,
                "sender_display_name": getattr(sender, "display_name", "") or sender.username,
                "sender_avatar_url": getattr(sender, "avatar_url", None),
                "content": message.content,
                "snippet": message.content[:100] if message.content else "Sent an attachment",
                "content_type": message.content_type,
                "metadata": message.metadata,
                "created_at": message.created_at.isoformat(),
            },
        )

    return message


def edit_message(
    message_id: int,
    user_id: int,
    new_content: str,
) -> Message:
    """Edit an existing message sent by user_id."""
    message = (
        Message.objects.filter(id=message_id)
        .select_related("conversation")
        .first()
    )
    if not message:
        raise NotFound("Message not found.")

    if message.sender_id != user_id:
        raise PermissionDenied("You can only edit your own messages.")

    if message.is_deleted:
        raise ValidationError("Cannot edit a deleted message.")

    stripped = new_content.strip()
    if not stripped:
        raise ValidationError("Message content cannot be empty.")

    message.content = stripped
    message.edited_at = timezone.now()
    message.save(update_fields=["content", "edited_at"])

    # Fan out edit event to all participants
    participants = ConversationParticipant.objects.filter(conversation=message.conversation)
    for p in participants:
        publish_chat_event(
            target_user_id=p.user_id,
            event_type="chat.message_edited",
            data={
                "conversation_id": str(message.conversation_id),
                "message_id": message.id,
                "content": message.content,
                "edited_at": message.edited_at.isoformat(),
            },
        )

    return message


def delete_message(
    message_id: int,
    user_id: int,
) -> Message:
    """Soft-delete a message sent by user_id."""
    message = (
        Message.objects.filter(id=message_id)
        .select_related("conversation")
        .first()
    )
    if not message:
        raise NotFound("Message not found.")

    if message.sender_id != user_id:
        raise PermissionDenied("You can only delete your own messages.")

    message.is_deleted = True
    message.content = ""
    message.save(update_fields=["is_deleted", "content"])

    # Fan out delete event
    participants = ConversationParticipant.objects.filter(conversation=message.conversation)
    for p in participants:
        publish_chat_event(
            target_user_id=p.user_id,
            event_type="chat.message_deleted",
            data={
                "conversation_id": str(message.conversation_id),
                "message_id": message.id,
            },
        )

    return message


def toggle_reaction(
    message_id: int,
    user_id: int,
    emoji: str,
) -> tuple[MessageReaction | None, bool]:
    """Add or remove an emoji reaction on a message."""
    message = (
        Message.objects.filter(id=message_id)
        .select_related("conversation")
        .first()
    )
    if not message:
        raise NotFound("Message not found.")

    # Check caller is a participant in the conversation
    is_part = ConversationParticipant.objects.filter(
        conversation=message.conversation,
        user_id=user_id,
    ).exists()
    if not is_part:
        raise PermissionDenied("You cannot react to messages in this conversation.")

    cleaned_emoji = emoji.strip()
    if not cleaned_emoji:
        raise ValidationError("Emoji cannot be empty.")

    # A user can only have at most one reaction per message
    user_reactions = list(
        MessageReaction.objects.filter(
            message=message,
            user_id=user_id,
        ).order_by("-updated_at")
    )

    if user_reactions:
        existing = user_reactions[0]
        # Clean up any historical duplicate reactions if present
        if len(user_reactions) > 1:
            for extra in user_reactions[1:]:
                extra.delete()

        if existing.emoji == cleaned_emoji:
            # Same emoji clicked again: toggle off (remove)
            existing.delete()
            reaction = None
            added = False
        else:
            # Different emoji clicked: swap to new emoji
            existing.emoji = cleaned_emoji
            existing.save(update_fields=["emoji", "updated_at"])
            reaction = existing
            added = True
    else:
        reaction = MessageReaction.objects.create(
            message=message,
            user_id=user_id,
            emoji=cleaned_emoji,
        )
        added = True

    # Broadcast reaction event to all participants
    participants = ConversationParticipant.objects.filter(conversation=message.conversation)
    for p in participants:
        publish_chat_event(
            target_user_id=p.user_id,
            event_type="chat.reaction_updated",
            data={
                "conversation_id": str(message.conversation_id),
                "message_id": message.id,
                "user_id": user_id,
                "emoji": cleaned_emoji,
                "added": added,
            },
        )

    return reaction, added


def mark_conversation_as_read(
    conversation_id: str | uuid.UUID,
    user_id: int,
    last_read_message_id: int | None = None,
) -> int:
    """Mark messages in a conversation as read up to last_read_message_id."""
    conv = get_conversation_for_user(conversation_id, user_id)

    if not last_read_message_id:
        latest = Message.objects.filter(conversation=conv).order_by("-id").first()
        last_read_message_id = latest.id if latest else 0

    ConversationParticipant.objects.filter(
        conversation=conv,
        user_id=user_id,
    ).update(
        last_read_message_id=last_read_message_id,
        last_read_at=timezone.now(),
    )

    # Broadcast read receipt to other participants
    other_participants = conv.participants.exclude(user_id=user_id)
    for p in other_participants:
        publish_chat_event(
            target_user_id=p.user_id,
            event_type="chat.read",
            data={
                "conversation_id": str(conv.id),
                "user_id": user_id,
                "last_read_message_id": last_read_message_id,
            },
        )

    return last_read_message_id


def broadcast_typing(
    conversation_id: str | uuid.UUID,
    user_id: int,
) -> None:
    """Broadcast an ephemeral typing status to other participants in a conversation."""
    conv = get_conversation_for_user(conversation_id, user_id)
    user = User.objects.get(id=user_id)

    other_participants = conv.participants.exclude(user_id=user_id)
    for p in other_participants:
        publish_chat_event(
            target_user_id=p.user_id,
            event_type="chat.typing",
            data={
                "conversation_id": str(conv.id),
                "user_id": user_id,
                "username": user.username,
            },
        )


def update_participant_settings(
    conversation_id: str | uuid.UUID,
    user_id: int,
    is_muted: bool | None = None,
    is_archived: bool | None = None,
) -> ConversationParticipant:
    """Update settings (muted, archived) for a participant in a conversation."""
    participant = (
        ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user_id=user_id,
        )
        .first()
    )
    if not participant:
        raise NotFound("Participant record not found.")

    fields_to_update = []
    if is_muted is not None:
        participant.is_muted = is_muted
        fields_to_update.append("is_muted")
    if is_archived is not None:
        participant.is_archived = is_archived
        fields_to_update.append("is_archived")

    if fields_to_update:
        participant.save(update_fields=fields_to_update)

    return participant
