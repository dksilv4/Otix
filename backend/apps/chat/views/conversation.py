"""API Views for chat conversations."""

from __future__ import annotations

import uuid

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.chat import services
from apps.chat.serializers import (
    ConversationCreateInputSerializer,
    ConversationSerializer,
    ConversationSettingsInputSerializer,
)


class ConversationListCreateView(APIView):
    """``GET /api/v1/chat/conversations`` -- list user's conversations.

    ``POST /api/v1/chat/conversations`` -- get or create direct conversation with friend.
    """

    def get(self, request: Request) -> Response:
        limit_param = request.query_params.get("limit")
        limit = int(limit_param) if limit_param and limit_param.isdigit() else 100
        conversations = services.list_conversations_for_user(request.user.id, limit=limit)
        serializer = ConversationSerializer(
            conversations,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data)

    def post(self, request: Request) -> Response:
        input_serializer = ConversationCreateInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        recipient_id = input_serializer.validated_data["recipient_id"]

        conv, created = services.get_or_create_direct_conversation(
            user_a_id=request.user.id,
            user_b_id=recipient_id,
        )
        serializer = ConversationSerializer(conv, context={"request": request})
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=status_code)


class ConversationUnreadCountView(APIView):
    """``GET /api/v1/chat/unread-count`` -- total unread messages count for user."""

    def get(self, request: Request) -> Response:
        count = services.get_total_unread_count(request.user.id)
        return Response({"count": count})


class ConversationDetailView(APIView):
    """``GET /api/v1/chat/conversations/{id}`` -- retrieve single conversation."""

    def get(self, request: Request, conversation_id: uuid.UUID) -> Response:
        conv = services.get_conversation_for_user(
            conversation_id=conversation_id,
            user_id=request.user.id,
        )
        serializer = ConversationSerializer(conv, context={"request": request})
        return Response(serializer.data)


class ConversationReadView(APIView):
    """``POST /api/v1/chat/conversations/{id}/read`` -- mark conversation as read."""

    def post(self, request: Request, conversation_id: uuid.UUID) -> Response:
        last_read_id = request.data.get("last_read_message_id")
        updated_id = services.mark_conversation_as_read(
            conversation_id=conversation_id,
            user_id=request.user.id,
            last_read_message_id=last_read_id,
        )
        return Response({"status": "ok", "last_read_message_id": updated_id})


class ConversationTypingView(APIView):
    """``POST /api/v1/chat/conversations/{id}/typing`` -- broadcast typing event."""

    def post(self, request: Request, conversation_id: uuid.UUID) -> Response:
        services.broadcast_typing(
            conversation_id=conversation_id,
            user_id=request.user.id,
        )
        return Response({"status": "ok"})


class ConversationSettingsView(APIView):
    """``PATCH /api/v1/chat/conversations/{id}/settings`` -- update mute/archive."""

    def patch(self, request: Request, conversation_id: uuid.UUID) -> Response:
        input_serializer = ConversationSettingsInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        participant = services.update_participant_settings(
            conversation_id=conversation_id,
            user_id=request.user.id,
            is_muted=input_serializer.validated_data.get("is_muted"),
            is_archived=input_serializer.validated_data.get("is_archived"),
        )
        return Response(
            {
                "status": "ok",
                "is_muted": participant.is_muted,
                "is_archived": participant.is_archived,
            }
        )
