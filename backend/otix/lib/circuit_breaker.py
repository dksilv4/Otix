"""Failure-counting circuit breaker with half-open recovery.

States:
  CLOSED    — normal operation, requests pass through
  OPEN      — failures exceeded threshold, requests are rejected immediately
  HALF_OPEN — recovery timeout expired, one probe request allowed through
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum


class State(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_requests: int = 1
    _state: State = State.CLOSED
    _failure_count: int = 0
    _last_failure_time: float = 0.0
    _opened_at: float = 0.0
    _half_open_requests: int = 0  # requests in current half-open window

    @property
    def state(self) -> State:
        if self._state == State.OPEN and self._should_attempt_recovery():
            self._state = State.HALF_OPEN
            self._half_open_requests = 0
        return self._state

    def allow_request(self) -> bool:
        """Called before making the protected call. Returns True if allowed."""
        s = self.state

        if s == State.CLOSED:
            return True

        if s == State.HALF_OPEN:
            if self._half_open_requests < self.half_open_max_requests:
                self._half_open_requests += 1
                return True
            return False

        # OPEN
        return False

    def record_success(self) -> None:
        """Called after a successful call."""
        if self._state == State.HALF_OPEN:
            self._state = State.CLOSED
            self._failure_count = 0
            self._half_open_requests = 0
        elif self._state == State.CLOSED:
            self._failure_count = 0

    def record_failure(self) -> None:
        """Called after a failed call."""
        self._failure_count += 1
        self._last_failure_time = time.monotonic()

        if self._state == State.HALF_OPEN:
            self._state = State.OPEN
            self._opened_at = time.monotonic()
        elif self._state == State.CLOSED and self._failure_count >= self.failure_threshold:
            self._state = State.OPEN
            self._opened_at = time.monotonic()

    def _should_attempt_recovery(self) -> bool:
        if self._opened_at == 0:
            return False
        return (time.monotonic() - self._opened_at) >= self.recovery_timeout
