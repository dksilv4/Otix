"""Backward compatibility module for UserGameServer -> UserNode."""

from apps.library.models.user_node import UserGameServer, UserNode

__all__ = ["UserGameServer", "UserNode"]
