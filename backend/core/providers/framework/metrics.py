"""Lightweight metrics for provider sync and HTTP observability.

No external dependencies — pure Python counters/histograms/gauges that can be
exposed via a ``/metrics`` endpoint or piped to Prometheus later. A single
process-wide registry backs the provider HTTP layer, circuit breakers, and
hydration pipelines.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any


def _label_key(labels: dict[str, str]) -> str:
    """Format a dictionary of labels into a canonical, sorted key string."""
    return ",".join(f"{k}={labels[k]}" for k in sorted(labels))


@dataclass
class Counter:
    """Monotonically increasing counter with optional multi-dimensional labels."""

    name: str
    help: str = ""
    _value: int = 0
    _labels: dict[str, int] = field(default_factory=dict)

    def inc(self, n: int = 1, **labels: str) -> None:
        """Increment the counter by n (default 1)."""
        if n < 0:
            raise ValueError("Counters can only be incremented by non-negative amounts.")
        self._value += n
        if labels:
            key = _label_key(labels)
            self._labels[key] = self._labels.get(key, 0) + n

    def value(self, **labels: str) -> int:
        """Return the current value, optionally scoped to matching labels."""
        if labels:
            return self._labels.get(_label_key(labels), 0)
        return self._value

    def reset(self) -> None:
        """Reset the counter to 0."""
        self._value = 0
        self._labels.clear()


@dataclass
class Histogram:
    """Cumulative histogram for measuring latency distributions."""

    name: str
    help: str = ""
    buckets: tuple[float, ...] = (0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0)
    _count: int = 0
    _sum: float = 0.0
    _bucket_counts: dict[float, int] = field(default_factory=dict)
    _label_counts: dict[str, int] = field(default_factory=dict)
    _label_sums: dict[str, float] = field(default_factory=dict)
    _label_buckets: dict[str, dict[float, int]] = field(default_factory=dict)

    def observe(self, value_seconds: float, **labels: str) -> None:
        """Record an observed duration or value."""
        self._count += 1
        self._sum += value_seconds
        for b in self.buckets:
            if value_seconds <= b:
                self._bucket_counts[b] = self._bucket_counts.get(b, 0) + 1
        if labels:
            key = _label_key(labels)
            self._label_counts[key] = self._label_counts.get(key, 0) + 1
            self._label_sums[key] = self._label_sums.get(key, 0.0) + value_seconds
            bkt = self._label_buckets.setdefault(key, {})
            for b in self.buckets:
                if value_seconds <= b:
                    bkt[b] = bkt.get(b, 0) + 1

    @property
    def count(self) -> int:
        """Total number of observations recorded."""
        return self._count

    @property
    def sum_seconds(self) -> float:
        """Sum of all observed values."""
        return self._sum

    @property
    def avg_seconds(self) -> float:
        """Arithmetic mean of observations, or 0.0 if no observations recorded."""
        return self._sum / self._count if self._count > 0 else 0.0

    def avg_seconds_by_label(self, **labels: str) -> float:
        """Arithmetic mean of observations for matching labels."""
        key = _label_key(labels)
        count = self._label_counts.get(key, 0)
        return self._label_sums.get(key, 0.0) / count if count > 0 else 0.0

    def reset(self) -> None:
        """Reset all observations."""
        self._count = 0
        self._sum = 0.0
        self._bucket_counts.clear()
        self._label_counts.clear()
        self._label_sums.clear()
        self._label_buckets.clear()


@dataclass
class Gauge:
    """Gauge representing a single numerical value that can go up and down."""

    name: str
    help: str = ""
    _labels: dict[str, float] = field(default_factory=dict)

    def set(self, value: float, **labels: str) -> None:
        """Set the gauge to the specified value."""
        self._labels[_label_key(labels)] = float(value)

    def inc(self, n: float = 1.0, **labels: str) -> None:
        """Increment the gauge by n."""
        key = _label_key(labels)
        self._labels[key] = self._labels.get(key, 0.0) + float(n)

    def dec(self, n: float = 1.0, **labels: str) -> None:
        """Decrement the gauge by n."""
        key = _label_key(labels)
        self._labels[key] = self._labels.get(key, 0.0) - float(n)

    def value(self, **labels: str) -> float:
        """Return the current gauge value for matching labels."""
        return self._labels.get(_label_key(labels), 0.0)

    def reset(self) -> None:
        """Clear all gauge label entries."""
        self._labels.clear()


class MetricsRegistry:
    """Registry maintaining active metrics across provider clients and pipelines."""

    def __init__(self) -> None:
        self._counters: dict[str, Counter] = {}
        self._histograms: dict[str, Histogram] = {}
        self._gauges: dict[str, Gauge] = {}

    def counter(self, name: str, help: str = "") -> Counter:
        """Get or create a named Counter."""
        if name not in self._counters:
            self._counters[name] = Counter(name=name, help=help)
        return self._counters[name]

    def histogram(
        self, name: str, help: str = "", buckets: tuple[float, ...] | None = None
    ) -> Histogram:
        """Get or create a named Histogram."""
        if name not in self._histograms:
            kwargs: dict[str, Any] = {"name": name, "help": help}
            if buckets is not None:
                kwargs["buckets"] = buckets
            self._histograms[name] = Histogram(**kwargs)
        return self._histograms[name]

    def gauge(self, name: str, help: str = "") -> Gauge:
        """Get or create a named Gauge."""
        if name not in self._gauges:
            self._gauges[name] = Gauge(name=name, help=help)
        return self._gauges[name]

    def snapshot(self) -> dict[str, Any]:
        """Return all metrics as a dict suitable for JSON serialization or Prometheus export."""
        return {
            "counters": {
                name: {"value": counter.value(), "labels": dict(counter._labels)}
                for name, counter in self._counters.items()
            },
            "histograms": {
                n: {"count": h.count, "sum": h.sum_seconds, "avg": h.avg_seconds}
                for n, h in self._histograms.items()
            },
            "gauges": {n: {"values": dict(g._labels)} for n, g in self._gauges.items()},
        }

    def reset(self) -> None:
        """Reset all registered metrics."""
        for counter in self._counters.values():
            counter.reset()
        for histogram in self._histograms.values():
            histogram.reset()
        for gauge in self._gauges.values():
            gauge.reset()


# Process-wide global registry
_registry = MetricsRegistry()


def get_metrics_registry() -> MetricsRegistry:
    """Return the global MetricsRegistry singleton."""
    return _registry


get_registry = get_metrics_registry


# ── Pre-declared framework sync metrics ────────────────────────────────────

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

HYDRATION_STAGE_DURATION = _registry.histogram(
    "otix_hydration_stage_seconds",
    "Wall-clock time per full-hydration stage, by provider/media_type/stage",
    buckets=(0.5, 1, 2, 5, 10, 30, 60, 120, 300),
)

HYDRATION_ITEM_DURATION = _registry.histogram(
    "otix_hydration_item_seconds",
    "Total wall-clock time to fully process one item, by provider/media_type",
    buckets=(5, 10, 30, 60, 120, 300, 600, 1200),
)

SYNC_JOBS_ACTIVE = _registry.gauge(
    "otix_sync_jobs_active",
    "Currently running sync jobs",
)

CIRCUIT_BREAKER_STATE = _registry.gauge(
    "otix_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 2=half_open)",
)


def track_entity_duration(
    provider: str, entity_type: str
) -> Callable[[], Generator[None, None, None]]:
    """Context manager to track entity processing duration."""

    @contextmanager
    def _track() -> Generator[None, None, None]:
        start = time.monotonic()
        try:
            yield
        finally:
            SYNC_ENTITY_DURATION.observe(
                time.monotonic() - start, provider=provider, entity_type=entity_type
            )

    return _track()


def track_api_call(provider: str) -> Callable[[], Generator[None, None, None]]:
    """Context manager to track provider API call latency."""

    @contextmanager
    def _track() -> Generator[None, None, None]:
        start = time.monotonic()
        try:
            yield
        finally:
            SYNC_API_CALL_DURATION.observe(time.monotonic() - start, provider=provider)

    return _track()


def track_rate_limit_wait(provider: str) -> Callable[[], Generator[None, None, None]]:
    """Context manager to track rate limit wait time."""

    @contextmanager
    def _track() -> Generator[None, None, None]:
        start = time.monotonic()
        try:
            yield
        finally:
            wait = time.monotonic() - start
            if wait > 0:
                SYNC_RATE_LIMIT_WAIT.observe(wait, provider=provider)

    return _track()
