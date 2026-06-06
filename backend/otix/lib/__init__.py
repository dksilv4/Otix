# TODO: Review this file
"""Pure utility functions (rate limiting, circuit breaker, pagination, metrics).

RULES:
- Zero imports from any other otix module.
- This is the innermost leaf — it depends on nothing internal.
"""

from otix.lib.circuit_breaker import CircuitBreaker, State as CircuitState
from otix.lib.metrics import (
    CIRCUIT_BREAKER_STATE,
    SYNC_API_CALL_DURATION,
    SYNC_ENTITIES_TOTAL,
    SYNC_ENTITY_DURATION,
    SYNC_JOBS_ACTIVE,
    SYNC_RATE_LIMIT_WAIT,
    MetricsRegistry,
    get_registry,
    track_api_call,
    track_entity_duration,
    track_rate_limit_wait,
)
from otix.lib.pagination import decode_cursor, encode_cursor
from otix.lib.rate_limiter import RateLimiter
from otix.lib.slug import slugify

__all__ = [
    "CIRCUIT_BREAKER_STATE",
    "CircuitBreaker",
    "CircuitState",
    "MetricsRegistry",
    "RateLimiter",
    "SYNC_API_CALL_DURATION",
    "SYNC_ENTITIES_TOTAL",
    "SYNC_ENTITY_DURATION",
    "SYNC_JOBS_ACTIVE",
    "SYNC_RATE_LIMIT_WAIT",
    "decode_cursor",
    "encode_cursor",
    "get_registry",
    "slugify",
    "track_api_call",
    "track_entity_duration",
    "track_rate_limit_wait",
]
