"""Per-item hydration analytics.

Records each full-hydration run — per-stage wall-clock timings, provider,
media type, status — to a bounded Redis sorted set so improvements can be
measured and targeted. Also exposes an aggregate summary.
"""

from __future__ import annotations

import json
import time
import uuid

import structlog

logger = structlog.get_logger()

RUNS_KEY = "hydration:runs"
MAX_RUNS = 2000


async def record_hydration_run(
    *,
    item_id: str | None,
    title: str | None,
    media_type: str,
    provider: str,
    stages: dict[str, float],
    total_seconds: float,
    status: str,
    error: str | None = None,
) -> None:
    from otix.infrastructure.redis import get_redis

    run = {
        "id": uuid.uuid4().hex[:12],
        "item_id": item_id,
        "title": title,
        "media_type": media_type,
        "provider": provider,
        "stages": {k: round(v, 3) for k, v in stages.items()},
        "total_seconds": round(total_seconds, 3),
        "status": status,
        "error": error,
        "ts": time.time(),
    }
    try:
        redis = await get_redis()
        await redis.zadd(RUNS_KEY, {json.dumps(run): run["ts"]})
        await redis.zremrangebyrank(RUNS_KEY, 0, -MAX_RUNS - 1)
    except Exception:
        logger.warning("failed to persist hydration run analytics", exc_info=True)


async def hydration_summary(limit: int = 200) -> dict:
    """Aggregate recent hydration runs by media_type/stage for improvement insights."""
    from otix.infrastructure.redis import get_redis

    try:
        redis = await get_redis()
        raw = await redis.zrevrange(RUNS_KEY, 0, limit - 1)
    except Exception:
        return {"runs": [], "totals": {}}

    runs = [json.loads(m) for m in raw]
    totals: dict[str, dict[str, float]] = {}
    for r in runs:
        key = f"{r.get('provider', '?')}:{r.get('media_type', '?')}"
        agg = totals.setdefault(key, {"count": 0, "total": 0.0, "errors": 0})
        agg["count"] += 1
        agg["total"] += r.get("total_seconds", 0.0)
        if r.get("status") == "error":
            agg["errors"] += 1

    # Average per-stage across runs, per media_type, to spot bottlenecks.
    stage_avgs: dict[str, dict[str, float]] = {}
    stage_samples: dict[tuple[str, str], int] = {}
    for r in runs:
        mt = r.get("media_type", "?")
        agg = stage_avgs.setdefault(mt, {})
        for stage, secs in (r.get("stages") or {}).items():
            bucket = agg.setdefault(stage, {"n": 0, "sum": 0.0})
            bucket["n"] += 1
            bucket["sum"] += secs
            stage_samples[(mt, stage)] = bucket["n"]
    for mt, stages in stage_avgs.items():
        stage_avgs[mt] = {k: round(v["sum"] / v["n"], 3) for k, v in stages.items() if v["n"]}

    # Global bottleneck ranking — slowest stages first, so the most impactful
    # improvement targets surface without per-type digging.
    bottlenecks = [
        {
            "stage": stage,
            "media_type": mt,
            "avg_seconds": stage_avgs[mt][stage],
            "n": stage_samples[(mt, stage)],
        }
        for mt, stages in stage_avgs.items()
        for stage in stages
    ]
    bottlenecks.sort(key=lambda b: b["avg_seconds"], reverse=True)

    return {"runs": runs, "totals": totals, "stage_averages": stage_avgs, "bottlenecks": bottlenecks}
