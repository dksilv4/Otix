"""Exception hierarchy for Otix provider integrations.

Every provider integration raises either these core exceptions or standard httpx/Django
exceptions so upper sync orchestrators and Celery tasks can cleanly handle retry, backoff,
circuit breaking, and fatal payload errors uniformly.
"""

from __future__ import annotations


class ProviderError(Exception):
    """Base exception for all provider integration errors."""


class RateLimitError(ProviderError):
    """Raised when an upstream provider throttles requests or rate limit token wait times out.

    Attributes:
        retry_after: Seconds to wait before retrying, if indicated by the provider
            (e.g., from an HTTP 429 Retry-After header). Defaults to 0.
    """

    def __init__(self, message: str = "", retry_after: int = 0) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class CircuitOpenError(ProviderError):
    """Raised when a request is attempted while the provider's circuit breaker is OPEN.

    Attributes:
        provider: Identifier of the provider whose circuit breaker is open.
    """

    def __init__(self, provider: str, message: str = "") -> None:
        msg = message or f"Circuit breaker is OPEN for {provider}"
        super().__init__(msg)
        self.provider = provider


class ProviderAuthError(ProviderError):
    """Raised on authentication or authorization failure (HTTP 401/403 or invalid credentials).

    Attributes:
        status_code: HTTP status code returned by the provider (e.g., 401, 403).
    """

    def __init__(self, message: str = "", status_code: int = 401) -> None:
        super().__init__(message)
        self.status_code = status_code


class ProviderNotFoundError(ProviderError):
    """Raised when a requested resource is not found (HTTP 404 or missing upstream entity).

    Attributes:
        status_code: HTTP status code returned by the provider (typically 404).
    """

    def __init__(self, message: str = "", status_code: int = 404) -> None:
        super().__init__(message)
        self.status_code = status_code


class ProviderPayloadError(ProviderError):
    """Raised when an upstream API returns a malformed payload or unexpected schema drift."""
