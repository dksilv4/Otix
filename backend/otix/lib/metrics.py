"""Lightweight metrics for provider sync observability.

No external dependencies — pure Python counters/histograms that can be exposed
via a /metrics endpoint or piped to Prometheus later.
"""

from __future__ import annotations

import time
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Counter:
    name: str
    help: str
    _value: int = 0
    _labels: dict[str, int] = field(default_factory=dict)

    def inc(self, n: int = 1, **labels: str) -> None:
        self._value += n
        if labels:
            key = _label_key(labels)
            self._labels[key] = self._labels.get(key, 0) + n

    def value(self, **labels: str) -> int:
        if labels:
            return self._labels.get(_label_key(labels), 0)
        return self._value


@dataclass
class Histogram:
    name: str
    help: str
    buckets: tuple[float, ...] = (0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0)
    _count: int = 0
    _sum: float = 0.0
    _bucket_counts: dict[float, int] = field(default_factory=dict)

    def observe(self, value_seconds: float) -> None:
        self._count += 1
        self._sum += value_seconds
        for b in self.buckets:
            if value_seconds <= b:
                self._bucket_counts[b] = self._bucket_counts.get(b, 0) + 1

    @property
    def count(self) -> int:
        return self._count

    @property
    def sum_seconds(self) -> float:
        return self._sum

    @property
    def avg_seconds(self) -> float:
        return self._sum / self._count if self._count > 0 else 0.0


@dataclass
class Gauge:
    name: str
    help: str
    _labels: dict[str, float] = field(default_factory=dict)

    def set(self, value: float, **labels: str) -> None:
        self._labels[_label_key(labels)] = value

    def value(self, **labels: str) -> float:
        return self._labels.get(_label_key(labels), 0.0)


def _label_key(labels: dict[str, str]) -> str:
    return ",".join(f"{k}={v}" for k, v in sorted(labels.items()))


class MetricsRegistry:
    def __init__(self):
        self._counters: dict[str, Counter] = {}
        self._histograms: dict[str, Histogram] = {}
        self._gauges: dict[str, Gauge] = {}

    def counter(self, name: str, help: str = "") -> Counter:
        if name not in self._counters:
            self._counters[name] = Counter(name=name, help=help)
        return self._counters[name]

    def histogram(self, name: str, help: str = "", buckets: tuple[float, ...] | None = None) -> Histogram:
        if name not in self._histograms:
            kwargs = {"name": name, "help": help}
            if buckets:
                kwargs["buckets"] = buckets
            self._histograms[name] = Histogram(**kwargs)
        return self._histograms[name]

    def gauge(self, name: str, help: str = "") -> Gauge:
        if name not in self._gauges:
            self._gauges[name] = Gauge(name=name, help=help)
        return self._gauges[name]

    def snapshot(self) -> dict:
        """Return all metrics as a dict suitable for JSON serialization."""
        return {
            "counters": {n: {"value": c.value(), "labels": dict(c._labels)} for n, c in self._counters.items()},
            "histograms": {
                n: {"count": h.count, "sum": h.sum_seconds, "avg": h.avg_seconds}
                for n, h in self._histograms.items()
            },
            "gauges": {n: {"values": dict(g._labels)} for n, g in self._gauges.items()},
        }


# Global registry
_registry = MetricsRegistry()


def get_registry() -> MetricsRegistry:
    return _registry


# ── Pre-declared sync metrics ────────────────────────────────────


SYNC_ENTITY_DURATION = _registry.histogram(
    "otix_sync_entity_duration_seconds",
    "Time to process a single entity (fetch + transform + hydrate)",
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0),
)

SYNC_API_CALL_DURATION = _registry.histogram(
    "otix_sync_api_call_duration_seconds",
    "Provider API call latency",
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0),
)

SYNC_RATE_LIMIT_WAIT = _registry.histogram(
    "otix_sync_rate_limit_wait_seconds",
    "Time spent waiting for rate limit tokens",
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0),
)

SYNC_ENTITIES_TOTAL = _registry.counter(
    "otix_sync_entities_total",
    "Total entities processed by provider and status",
)

SYNC_JOBS_ACTIVE = _registry.gauge(
    "otix_sync_jobs_active",
    "Currently running sync jobs",
)

CIRCUIT_BREAKER_STATE = _registry.gauge(
    "otix_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 2=half_open)",
)


def track_entity_duration(provider: str, entity_type: str) -> Callable:
    """Context manager to track entity processing duration."""
    @contextmanager
    def _track():
        start = time.monotonic()
        yield
        SYNC_ENTITY_DURATION.observe(time.monotonic() - start)
        SYNC_ENTITIES_TOTAL.inc(provider=provider, entity_type=entity_type, status="success")

    return _track()


def track_api_call(provider: str) -> Callable:
    """Context manager to track provider API call latency."""
    @contextmanager
    def _track():
        start = time.monotonic()
        yield
        SYNC_API_CALL_DURATION.observe(time.monotonic() - start)

    return _track()


def track_rate_limit_wait(provider: str) -> Callable:
    """Context manager to track rate limit wait time."""
    @contextmanager
    def _track():
        start = time.monotonic()
        yield
        wait = time.monotonic() - start
        if wait > 0:
            SYNC_RATE_LIMIT_WAIT.observe(wait)

    return _track()
