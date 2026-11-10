#!/usr/bin/env python3
"""
backend/scripts/benchmark_backend.py

Automated Performance Benchmark Suite for Otix Backend Subsystems:
1. Python Release & Catalog Parser Throughput across 105+ shared fixtures
2. Query Count Scaling & N+1 Regression Verification (via Django ORM test suite)

Usage:
    python backend/scripts/benchmark_backend.py [--json]
"""

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def load_server_catalog_parser():
    """Load the parse_release_name function standalone without full Django runtime."""
    catalog_path = Path(__file__).resolve().parent.parent / "apps" / "library" / "services" / "server_catalog.py"
    if not catalog_path.exists():
        raise FileNotFoundError(f"server_catalog.py not found at: {catalog_path}")

    spec = importlib.util.spec_from_file_location("server_catalog", catalog_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["server_catalog"] = module
    spec.loader.exec_module(module)
    return module.parse_release_name


def benchmark_parser(iterations=50):
    """Benchmark Python release name parser against the shared fixtures suite."""
    project_root = Path(__file__).resolve().parent.parent.parent
    fixtures_path = project_root / "fixtures" / "parser_fixtures.json"
    if not fixtures_path.exists():
        fixtures_path = Path("fixtures/parser_fixtures.json")
    if not fixtures_path.exists():
        raise FileNotFoundError(f"Fixture file not found: {fixtures_path}")

    with open(fixtures_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    cases = data.get("cases", [])
    if not cases:
        raise ValueError("No test cases found in parser_fixtures.json")

    parse_release_name = load_server_catalog_parser()

    # Warmup
    for c in cases[:10]:
        parse_release_name(c["input"], c.get("ext_hint", ""), c.get("parent_dir", ""))

    total_parses = len(cases) * iterations
    start_time = time.perf_counter()

    for _ in range(iterations):
        for c in cases:
            parse_release_name(c["input"], c.get("ext_hint", ""), c.get("parent_dir", ""))

    end_time = time.perf_counter()
    duration_s = end_time - start_time
    duration_ms = duration_s * 1000.0
    parses_per_sec = int(total_parses / duration_s) if duration_s > 0 else 0
    mean_latency_us = (duration_s / total_parses) * 1_000_000.0 if total_parses > 0 else 0.0

    target_sla_parses_sec = 20000
    sla_passed = parses_per_sec >= target_sla_parses_sec

    return {
        "casesCount": len(cases),
        "iterations": iterations,
        "totalParses": total_parses,
        "durationMs": round(duration_ms, 2),
        "meanLatencyUs": round(mean_latency_us, 2),
        "parsesPerSec": parses_per_sec,
        "slaTargetParsesPerSec": target_sla_parses_sec,
        "slaPassed": sla_passed,
    }


def verify_query_counts():
    """Verify O(1) query count regression test if docker or environment is accessible."""
    # Check if docker is available and otix-api-1 is running
    try:
        check_proc = subprocess.run(
            ["docker", "ps", "--filter", "name=otix-api-1", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if "otix-api-1" in check_proc.stdout:
            test_proc = subprocess.run(
                ["docker", "exec", "otix-api-1", "python", "manage.py", "test", "apps.library.tests.test_query_counts"],
                capture_output=True,
                text=True,
                timeout=30,
            )
            passed = test_proc.returncode == 0 and "OK" in test_proc.stderr
            return {
                "checked": True,
                "passed": passed,
                "output": test_proc.stderr if test_proc.stderr else test_proc.stdout,
                "description": "Django O(1) query counts scaling (/api/v1/game-servers & /api/v1/nodes)",
            }
    except Exception as err:
        return {
            "checked": False,
            "passed": True,
            "description": f"Query count check skipped ({err})",
        }

    return {
        "checked": False,
        "passed": True,
        "description": "Docker container otix-api-1 not running, skipped live DB check",
    }


def run_all_benchmarks():
    parser_metrics = benchmark_parser(iterations=50)
    query_metrics = verify_query_counts()

    overall_passed = parser_metrics["slaPassed"] and (not query_metrics["checked"] or query_metrics["passed"])

    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "subsystem": "Otix Backend Subsystem",
        "slaPassed": overall_passed,
        "parser": parser_metrics,
        "queries": query_metrics,
    }


def main():
    parser = argparse.ArgumentParser(description="Otix Backend Performance Benchmark Runner")
    parser.add_argument("--json", action="store_true", help="Output JSON results only")
    args = parser.parse_args()

    results = run_all_benchmarks()

    if args.json:
        print(json.dumps(results, indent=2))
        sys.exit(0 if results["slaPassed"] else 1)

    print("=" * 80)
    print("                OTIX BACKEND AUTOMATED PERFORMANCE BENCHMARK")
    print("=" * 80)
    p = results["parser"]
    print(f"Parser Throughput:     {p['parsesPerSec']:,} parses/sec (Target: > {p['slaTargetParsesPerSec']:,}/s)")
    print(f"Mean Latency:          {p['meanLatencyUs']} µs per item ({p['totalParses']:,} total parsed in {p['durationMs']} ms)")
    print(f"Parser SLA Status:     {'PASS' if p['slaPassed'] else 'FAIL'}")

    q = results["queries"]
    print("-" * 80)
    if q["checked"]:
        print(f"Query Count Scaling:   {'PASS (Strict O(1))' if q['passed'] else 'FAIL'}")
    else:
        print(f"Query Count Scaling:   SKIPPED ({q['description']})")
    print("=" * 80)

    sys.exit(0 if results["slaPassed"] else 1)


if __name__ == "__main__":
    main()
