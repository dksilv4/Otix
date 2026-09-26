"""Backward compatibility module for GameServerDownload -> NodeDownload."""

from apps.library.models.node_download import GameServerDownload, NodeDownload

__all__ = ["GameServerDownload", "NodeDownload"]
