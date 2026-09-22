"""Otix Provider Integration Framework.

Public exports for building modular, resilient, and observable provider integrations.
"""

from __future__ import annotations

# Resilience
from core.providers.framework.cache import (
    ApiCache,
    url_for_cache,
)

# Capabilities
from core.providers.framework.capabilities import (
    ProviderCapability,
    ProviderManifest,
)
from core.providers.framework.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
)

# Client & Shared Networking
from core.providers.framework.client import (
    BaseProvider,
    BaseProviderClient,
    resolve_shared_http_client,
)

# Errors
from core.providers.framework.errors import (
    CircuitOpenError,
    ProviderAuthError,
    ProviderError,
    ProviderNotFoundError,
    ProviderPayloadError,
    RateLimitError,
)

# Hydrators
from core.providers.framework.hydrators import (
    atomic_seed,
    prefetch_external_ids,
    safe_bulk_create,
)

# Metrics
from core.providers.framework.metrics import (
    Counter,
    Gauge,
    Histogram,
    MetricsRegistry,
    get_metrics_registry,
    track_api_call,
)

# Registry
from core.providers.framework.registry import (
    ProviderRegistry,
    register_provider,
    registry,
)

# Telemetry
from core.providers.framework.telemetry import (
    ExecutionTimeline,
    TimelineSpan,
    record_timeline,
)

# Testing
from core.providers.framework.testing import (
    create_mock_transport,
    load_fixture,
)

# Transformers
from core.providers.framework.transformers import (
    clamp_rating,
    compute_payload_hash,
    parse_iso_date,
    sanitize_text,
)

# Types
from core.providers.framework.types import (
    JSONValue,
    NormalizedAsset,
    NormalizedCompany,
    NormalizedCredit,
    NormalizedEpisode,
    NormalizedMediaItem,
    NormalizedRating,
    NormalizedSeason,
    NormalizedVideo,
)
from core.ratelimit import RateLimiter

__all__ = [
    # Client
    "BaseProvider",
    "BaseProviderClient",
    "resolve_shared_http_client",
    # Resilience
    "CircuitBreaker",
    "CircuitState",
    "RateLimiter",
    "ApiCache",
    "url_for_cache",
    # Capabilities
    "ProviderCapability",
    "ProviderManifest",
    # Telemetry
    "ExecutionTimeline",
    "TimelineSpan",
    "record_timeline",
    # Metrics
    "Counter",
    "Histogram",
    "Gauge",
    "MetricsRegistry",
    "track_api_call",
    "get_metrics_registry",
    # Errors
    "ProviderError",
    "RateLimitError",
    "CircuitOpenError",
    "ProviderAuthError",
    "ProviderNotFoundError",
    "ProviderPayloadError",
    # Types
    "JSONValue",
    "NormalizedMediaItem",
    "NormalizedAsset",
    "NormalizedCredit",
    "NormalizedCompany",
    "NormalizedRating",
    "NormalizedVideo",
    "NormalizedSeason",
    "NormalizedEpisode",
    # Transformers
    "parse_iso_date",
    "sanitize_text",
    "compute_payload_hash",
    "clamp_rating",
    # Hydrators
    "safe_bulk_create",
    "prefetch_external_ids",
    "atomic_seed",
    # Registry
    "ProviderRegistry",
    "registry",
    "register_provider",
    # Testing
    "create_mock_transport",
    "load_fixture",
]
