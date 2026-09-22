"""Otix Provider Integration Framework.

Modular, isolated provider clients and pipelines for metadata, artwork, ratings,
and library sync.
"""

from core.providers.framework import (
    BaseProvider,
    BaseProviderClient,
    CircuitBreaker,
    ExecutionTimeline,
    ProviderCapability,
    ProviderError,
    ProviderManifest,
    RateLimitError,
    TimelineSpan,
    registry,
)

__all__ = [
    "BaseProvider",
    "BaseProviderClient",
    "CircuitBreaker",
    "ExecutionTimeline",
    "ProviderCapability",
    "ProviderError",
    "ProviderManifest",
    "RateLimitError",
    "TimelineSpan",
    "registry",
]
