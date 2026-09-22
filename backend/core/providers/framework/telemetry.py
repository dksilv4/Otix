"""Granular execution timeline and span tracing for provider pipelines.

Tracks nested stage durations (e.g. rate limit wait, HTTP fetch, JSON transform,
database hydration) and exports to hierarchical dictionaries, Perfetto / Chrome
Trace Event format (chrome://tracing), and ASCII waterfall charts for CLI tools.
"""

from __future__ import annotations

import inspect
import json
import time
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TimelineSpan:
    """A measured timing span within an execution timeline."""

    name: str
    start_time: float
    end_time: float | None = None
    duration_ms: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    children: list[TimelineSpan] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Return hierarchical JSON-serializable dictionary representing the span."""
        return {
            "name": self.name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
            "metadata": self.metadata,
            "children": [child.to_dict() for child in self.children],
        }


class ExecutionTimeline:
    """Tracks hierarchical execution spans for a single provider sync operation."""

    def __init__(
        self,
        provider: str,
        entity_type: str,
        external_id: str = "",
        spans: list[TimelineSpan] | None = None,
    ) -> None:
        self.provider = provider
        self.entity_type = entity_type
        self.external_id = external_id
        self.spans: list[TimelineSpan] = spans if spans is not None else []
        self._active_stack: list[TimelineSpan] = []

    @contextmanager
    def measure(self, name: str, **meta: Any) -> Generator[TimelineSpan, None, None]:
        """Context manager to measure execution time of a named span.

        Supports arbitrary nesting: spans opened inside an active span become
        its children.
        """
        span = TimelineSpan(
            name=name,
            start_time=time.time(),
            metadata=dict(meta),
        )

        if self._active_stack:
            self._active_stack[-1].children.append(span)
        else:
            self.spans.append(span)

        self._active_stack.append(span)
        try:
            yield span
        except Exception as exc:
            span.metadata["error"] = str(exc)
            raise
        finally:
            span.end_time = time.time()
            span.duration_ms = max(0.0, (span.end_time - span.start_time) * 1000.0)
            self._active_stack.pop()

    @property
    def total_duration_ms(self) -> float:
        """Total wall-clock duration in ms."""
        if not self.spans:
            return 0.0
        earliest = min(s.start_time for s in self.spans)
        latest = max(s.end_time or s.start_time for s in self.spans)
        return max(0.0, (latest - earliest) * 1000.0)

    def to_dict(self) -> dict[str, Any]:
        """Return a hierarchical dictionary representation of the timeline."""
        return {
            "provider": self.provider,
            "entity_type": self.entity_type,
            "external_id": self.external_id,
            "spans": [span.to_dict() for span in self.spans],
        }

    def to_chrome_trace(self) -> list[dict[str, Any]]:
        """Export timeline to Chrome Trace Event format (Perfetto / chrome://tracing).

        Events use the Complete Event type (``ph="X"``) with microsecond precision.
        """
        events: list[dict[str, Any]] = []

        def _collect(span: TimelineSpan) -> None:
            ts_us = int(span.start_time * 1_000_000)
            dur_us = int((span.duration_ms or 0.0) * 1_000)
            args = {
                **span.metadata,
                "entity_type": self.entity_type,
                "external_id": self.external_id,
            }
            events.append({
                "name": span.name,
                "cat": self.provider,
                "ph": "X",
                "ts": ts_us,
                "dur": dur_us,
                "pid": 1,
                "tid": 1,
                "args": args,
            })
            for child in span.children:
                _collect(child)

        for root_span in self.spans:
            _collect(root_span)

        return events

    def render_ascii_waterfall(self) -> str:
        """Render an ASCII waterfall representation suitable for terminal output."""
        all_spans: list[tuple[int, TimelineSpan]] = []

        def _flatten(span: TimelineSpan, depth: int) -> None:
            all_spans.append((depth, span))
            for child in span.children:
                _flatten(child, depth + 1)

        for root in self.spans:
            _flatten(root, 0)

        if not all_spans:
            return f"Timeline: {self.provider} {self.entity_type}:{self.external_id} (empty)"

        min_start = min(s.start_time for _, s in all_spans)
        max_end = max(s.end_time or s.start_time for _, s in all_spans)
        total_duration_ms = max(0.001, (max_end - min_start) * 1000.0)

        bar_width = 30
        lines = [
            f"Timeline: {self.provider} {self.entity_type}:{self.external_id}",
            "=" * 78,
            f"{'Span Name':<32} {'Offset':>9} {'Duration':>10}  Waterfall",
            "-" * 78,
        ]

        for depth, span in all_spans:
            offset_ms = max(0.0, (span.start_time - min_start) * 1000.0)
            dur_ms = span.duration_ms or 0.0

            # Calculate relative bar position
            start_ratio = min(1.0, max(0.0, offset_ms / total_duration_ms))
            end_ratio = min(1.0, max(start_ratio, (offset_ms + dur_ms) / total_duration_ms))

            start_col = int(start_ratio * bar_width)
            end_col = max(start_col + 1, int(end_ratio * bar_width))
            bar_len = min(bar_width - start_col, end_col - start_col)

            bar_str = " " * start_col + "=" * bar_len + " " * (bar_width - start_col - bar_len)
            indent = "  " * depth
            name = (indent + span.name)[:31]
            lines.append(f"{name:<32} {offset_ms:>8.1f}ms {dur_ms:>9.1f}ms  [{bar_str}]")

        lines.append("-" * 78)
        lines.append(f"Total wall-clock duration: {total_duration_ms:.2f}ms")
        return "\n".join(lines)

    def save_to_redis(self, redis_client: Any, max_entries: int = 100) -> Any:
        """Store the timeline in a rolling Redis list ``otix:timelines:{provider}``.

        Supports both synchronous and asynchronous (redis.asyncio) clients.
        """
        key = f"otix:timelines:{self.provider}"
        payload = json.dumps(self.to_dict(), ensure_ascii=False)

        lpush_func = getattr(redis_client, "lpush", None)
        if lpush_func is not None and inspect.iscoroutinefunction(lpush_func):

            async def _async_save() -> None:
                await redis_client.lpush(key, payload)
                await redis_client.ltrim(key, 0, max_entries - 1)

            return _async_save()

        res = redis_client.lpush(key, payload)
        if inspect.iscoroutine(res):

            async def _await_res() -> None:
                await res
                trim_res = redis_client.ltrim(key, 0, max_entries - 1)
                if inspect.iscoroutine(trim_res):
                    await trim_res

            return _await_res()

        redis_client.ltrim(key, 0, max_entries - 1)
        return None


@contextmanager
def record_timeline(
    provider: str,
    entity_type: str,
    external_id: str = "",
) -> Generator[ExecutionTimeline, None, None]:
    """Context manager to measure and record an execution timeline for a provider operation."""
    timeline = ExecutionTimeline(
        provider=provider,
        entity_type=entity_type,
        external_id=external_id,
    )
    yield timeline
