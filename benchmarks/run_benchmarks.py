"""Benchmark script for Otix API endpoints.

Usage: python benchmarks/run_benchmarks.py
Requires: API server running at localhost:8000
"""

import json
import statistics
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

BASE = "http://localhost:8000"
ITERATIONS = 5  # run each endpoint N times for statistical significance

# Known-good test IDs from the live database
MEDIA_ID_GAME = "oti_946b6a651da8"      # Cyberpunk 2077
MEDIA_ID_SHOW = "oti_c055c2f871ab"      # The Boys
MEDIA_ID_MOVIE = "oti_a6a2e84b5285"     # Project Hail Mary

ENDPOINTS = [
    # (label, url, description)
    ("GET /health", f"{BASE}/health", "Health check baseline"),
    ("GET /api/discover/hero", f"{BASE}/api/discover/hero?limit=6", "Hero carousel"),
    ("GET /api/discover/sections", f"{BASE}/api/discover/sections", "Homepage sections"),
    ("GET /api/discover/movie/trending", f"{BASE}/api/discover/movie/trending?limit=20", "Trending movies"),
    ("GET /api/media (game detail)", f"{BASE}/api/media/{MEDIA_ID_GAME}", "Game detail page"),
    ("GET /api/media (show detail)", f"{BASE}/api/media/{MEDIA_ID_SHOW}", "Show detail page"),
    ("GET /api/media (movie detail)", f"{BASE}/api/media/{MEDIA_ID_MOVIE}", "Movie detail page"),
    ("GET /api/media/search", f"{BASE}/api/media/search?q=cyberpunk", "Full-text search"),
]


def time_request(url: str) -> tuple[int, float, int, str]:
    """Make a single request and return (status, elapsed_seconds, body_bytes, error)."""
    start = time.perf_counter()
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            elapsed = time.perf_counter() - start
            return resp.status, elapsed, len(body), ""
    except urllib.error.HTTPError as e:
        elapsed = time.perf_counter() - start
        body = e.fp.read() if e.fp else b""
        return e.code, elapsed, len(body), str(e)
    except Exception as e:
        elapsed = time.perf_counter() - start
        return 0, elapsed, 0, str(e)


def run_benchmarks() -> dict:
    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "iterations_per_endpoint": ITERATIONS,
        "results": [],
    }

    for label, url, description in ENDPOINTS:
        times = []
        statuses = []
        sizes = []

        print(f"\n{'='*60}")
        print(f"  {label}")
        print(f"  {description}")
        print(f"{'='*60}")

        for i in range(ITERATIONS):
            status, elapsed, size, error = time_request(url)
            elapsed_ms = elapsed * 1000
            times.append(elapsed_ms)
            statuses.append(status)
            sizes.append(size)
            marker = "← cold" if i == 0 else f"warm #{i}"
            err = f"  ERR: {error[:80]}" if error else ""
            print(f"  [{i+1}/{ITERATIONS}] {status}  {elapsed_ms:.1f}ms  {size}B  {marker}{err}")

        valid_times = [t for t, s in zip(times, statuses) if s == 200]
        if valid_times:
            endpoint_result = {
                "label": label,
                "url": url,
                "description": description,
                "cold_ms": round(times[0], 1),
                "warm_avg_ms": round(statistics.mean(valid_times[1:]), 1) if len(valid_times) > 1 else None,
                "min_ms": round(min(valid_times), 1),
                "max_ms": round(max(valid_times), 1),
                "avg_ms": round(statistics.mean(valid_times), 1),
                "median_ms": round(statistics.median(valid_times), 1),
                "p95_ms": round(sorted(valid_times)[int(len(valid_times) * 0.95)], 1) if len(valid_times) >= 3 else None,
                "stdev_ms": round(statistics.stdev(valid_times), 1) if len(valid_times) > 1 else 0,
                "all_times_ms": [round(t, 1) for t in times],
                "response_bytes": sizes[0],
                "statuses": statuses,
            }
        else:
            endpoint_result = {
                "label": label,
                "url": url,
                "error": f"All requests failed. Statuses: {statuses}",
                "all_times_ms": [round(t, 1) for t in times],
            }

        results["results"].append(endpoint_result)

    return results


def format_summary(results: dict) -> str:
    """Format a human-readable summary table."""
    lines = []
    lines.append("")
    lines.append("=" * 90)
    lines.append(f"  Otix API Benchmark Results — {results['timestamp']}")
    lines.append(f"  {ITERATIONS} iterations per endpoint")
    lines.append("=" * 90)
    lines.append("")
    lines.append(f"{'Endpoint':<38} {'Cold':>7} {'WarmAvg':>8} {'Avg':>7} {'P95':>7} {'Min':>7} {'Max':>7}")
    lines.append("-" * 90)

    for r in results["results"]:
        if "error" in r:
            lines.append(f"  {r['label']:<36}  ERROR: {r['error']}")
        else:
            cold = f"{r['cold_ms']:.0f}ms"
            warm = f"{r['warm_avg_ms']:.0f}ms" if r['warm_avg_ms'] is not None else "-"
            avg = f"{r['avg_ms']:.0f}ms"
            p95 = f"{r['p95_ms']:.0f}ms" if r['p95_ms'] is not None else "-"
            mn = f"{r['min_ms']:.0f}ms"
            mx = f"{r['max_ms']:.0f}ms"
            lines.append(f"  {r['label']:<38} {cold:>7} {warm:>8} {avg:>7} {p95:>7} {mn:>7} {mx:>7}")

    lines.append("-" * 90)
    lines.append("  Cold = first request (empty cache) | WarmAvg = average of warm iterations")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    results = run_benchmarks()

    json_path = f"/Users/dk/dev/Otix/benchmarks/response-times-{stamp}.json"
    with open(json_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    # Also write/overwrite the "latest" symlink target
    with open("/Users/dk/dev/Otix/benchmarks/response-times-latest.json", "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(format_summary(results))
    print(f"Results saved to: {json_path}")
    print("Latest copy at: benchmarks/response-times-latest.json")
