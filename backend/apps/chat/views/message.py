"""API Views for chat messages and reactions."""

from __future__ import annotations

import uuid

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.chat import services
from apps.chat.models import MessageReaction
from apps.chat.serializers import (
    MessageEditInputSerializer,
    MessageReactionInputSerializer,
    MessageReactionSerializer,
    MessageSendInputSerializer,
    MessageSerializer,
)


class MessageListCreateView(APIView):
    """``GET /api/v1/chat/conversations/{id}/messages`` -- list messages.

    ``POST /api/v1/chat/conversations/{id}/messages`` -- send a new message.
    """

    def get(self, request: Request, conversation_id: uuid.UUID) -> Response:
        limit_param = request.query_params.get("limit", "50")
        try:
            limit = min(max(int(limit_param), 1), 100)
        except ValueError:
            limit = 50

        before_id_param = request.query_params.get("before_id")
        before_id = int(before_id_param) if before_id_param and before_id_param.isdigit() else None

        messages = services.list_messages(
            conversation_id=conversation_id,
            user_id=request.user.id,
            limit=limit,
            before_id=before_id,
        )
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)

    def post(self, request: Request, conversation_id: uuid.UUID) -> Response:
        input_serializer = MessageSendInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        message = services.send_message(
            conversation_id=conversation_id,
            sender_id=request.user.id,
            content=input_serializer.validated_data.get("content", ""),
            content_type=input_serializer.validated_data.get("content_type", "text"),
            metadata=input_serializer.validated_data.get("metadata", {}),
            attachments_data=input_serializer.validated_data.get("attachments", []),
        )
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


class MessageDetailView(APIView):
    """``PATCH /api/v1/chat/conversations/{id}/messages/{msg_id}`` -- edit.

    ``DELETE /api/v1/chat/conversations/{id}/messages/{msg_id}`` -- soft delete.
    """

    def patch(
        self, request: Request, conversation_id: uuid.UUID, message_id: int
    ) -> Response:
        input_serializer = MessageEditInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        message = services.edit_message(
            message_id=message_id,
            user_id=request.user.id,
            new_content=input_serializer.validated_data["content"],
        )
        return Response(MessageSerializer(message).data)

    def delete(
        self, request: Request, conversation_id: uuid.UUID, message_id: int
    ) -> Response:
        message = services.delete_message(
            message_id=message_id,
            user_id=request.user.id,
        )
        return Response(MessageSerializer(message).data)


class MessageReactionView(APIView):
    """``POST /api/v1/chat/conversations/{id}/messages/{msg_id}/reactions`` -- toggle reaction."""

    def post(
        self, request: Request, conversation_id: uuid.UUID, message_id: int
    ) -> Response:
        input_serializer = MessageReactionInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        emoji = input_serializer.validated_data["emoji"]
        _, added = services.toggle_reaction(
            message_id=message_id,
            user_id=request.user.id,
            emoji=emoji,
        )
        reactions = MessageReaction.objects.filter(message_id=message_id)
        return Response({
            "status": "ok",
            "added": added,
            "emoji": emoji,
            "reactions": MessageReactionSerializer(reactions, many=True).data,
        })
