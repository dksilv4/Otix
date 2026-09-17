"""Metric snapshot domain logic.

The legacy ``GET /metric`` endpoint returns the process metrics registry
snapshot (``old-backend/otix/lib/metrics.py``), which exposes pre-declared sync
counters/histograms/gauges. The greenfield Django process has no such runtime
registry yet, so the route returns the same JSON envelope with empty metric
buckets. When infra metrics land this service should read from that registry.
"""


def get_metrics_snapshot() -> dict:
    """Return the metrics registry snapshot envelope (empty until a registry exists)."""
    return {"counters": {}, "histograms": {}, "gauges": {}}
