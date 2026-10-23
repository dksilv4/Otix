"""URL configuration for chat endpoints."""

from django.urls import path

from apps.chat.views import (
    ConversationDetailView,
    ConversationListCreateView,
    ConversationReadView,
    ConversationSettingsView,
    ConversationTypingView,
    ConversationUnreadCountView,
    MessageDetailView,
    MessageListCreateView,
    MessageReactionView,
)

app_name = "chat"

urlpatterns = [
    path("unread-count", ConversationUnreadCountView.as_view(), name="chat-unread-count"),
    path("unread-count/", ConversationUnreadCountView.as_view(), name="chat-unread-count-slash"),
    path("conversations", ConversationListCreateView.as_view(), name="conversation-list-create"),
    path("conversations/", ConversationListCreateView.as_view(), name="conversation-list-create-slash"),
    path(
        "conversations/<uuid:conversation_id>",
        ConversationDetailView.as_view(),
        name="conversation-detail",
    ),
    path(
        "conversations/<uuid:conversation_id>/",
        ConversationDetailView.as_view(),
        name="conversation-detail-slash",
    ),
    path(
        "conversations/<uuid:conversation_id>/read",
        ConversationReadView.as_view(),
        name="conversation-read",
    ),
    path(
        "conversations/<uuid:conversation_id>/read/",
        ConversationReadView.as_view(),
        name="conversation-read-slash",
    ),
    path(
        "conversations/<uuid:conversation_id>/typing",
        ConversationTypingView.as_view(),
        name="conversation-typing",
    ),
    path(
        "conversations/<uuid:conversation_id>/typing/",
        ConversationTypingView.as_view(),
        name="conversation-typing-slash",
    ),
    path(
        "conversations/<uuid:conversation_id>/settings",
        ConversationSettingsView.as_view(),
        name="conversation-settings",
    ),
    path(
        "conversations/<uuid:conversation_id>/settings/",
        ConversationSettingsView.as_view(),
        name="conversation-settings-slash",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages",
        MessageListCreateView.as_view(),
        name="message-list-create",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/",
        MessageListCreateView.as_view(),
        name="message-list-create-slash",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/<int:message_id>",
        MessageDetailView.as_view(),
        name="message-detail",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/<int:message_id>/",
        MessageDetailView.as_view(),
        name="message-detail-slash",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/<int:message_id>/reactions",
        MessageReactionView.as_view(),
        name="message-reaction",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/<int:message_id>/reactions/",
        MessageReactionView.as_view(),
        name="message-reaction-slash",
    ),
]
