"""Chat services package."""

from apps.chat.services.chat_service import (
    FriendshipRequiredError,
    are_friends,
    broadcast_typing,
    delete_message,
    edit_message,
    get_conversation_for_user,
    get_or_create_direct_conversation,
    get_total_unread_count,
    list_conversations_for_user,
    list_messages,
    mark_conversation_as_read,
    publish_chat_event,
    send_message,
    toggle_reaction,
    update_participant_settings,
)

__all__ = [
    "FriendshipRequiredError",
    "are_friends",
    "broadcast_typing",
    "delete_message",
    "edit_message",
    "get_conversation_for_user",
    "get_or_create_direct_conversation",
    "get_total_unread_count",
    "list_conversations_for_user",
    "list_messages",
    "mark_conversation_as_read",
    "publish_chat_event",
    "send_message",
    "toggle_reaction",
    "update_participant_settings",
]
