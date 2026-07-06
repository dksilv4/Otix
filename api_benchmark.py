#!/usr/bin/env python3
"""Comprehensive API endpoint benchmark & optimization analysis.

Usage:
    python api_benchmark.py [--base-url http://localhost:8000] [--output report.md]

Measures every registered endpoint, captures response times, flags slow endpoints,
and suggests optimization opportunities.
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

BASE_URL = "http://localhost:8000"

# Thresholds (in seconds)
WARN_MS = 500  # slow
CRIT_MS = 1000  # very slow

@dataclass
class EndpointResult:
    method: str
    path: str
    status: int
    elapsed_ms: float
    error: str | None = None

@dataclass
class ReportSection:
    title: str
    results: list[EndpointResult] = field(default_factory=list)


def _fmt(ms: float) -> str:
    if ms < WARN_MS:
        return f"{ms:>8.0f}ms"
    elif ms < CRIT_MS:
        return f"{ms:>8.0f}ms ⚠️"
    else:
        return f"{ms:>8.0f}ms 🔴"


def make_url(path: str) -> str:
    return f"{BASE_URL}{path}"


# ── Endpoint catalog ──────────────────────────────────────────────────
# Each entry: (method, path_template, description, needs_auth, params_fn)
# params_fn(body, path_params) populates path params & request body.

EndpointDef = tuple[str, str, str, bool, Any]

ANON_ENDPOINTS: list[EndpointDef] = [
    # Health
    ("GET", "/health", "Root health check", False, lambda b, p: ({}, {})),
    ("GET", "/healthz", "Readiness probe", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/health", "API health", False, lambda b, p: ({}, {})),

    # Auth
    ("POST", "/api/v1/auth/login", "Login", False, lambda b, p: ({}, {"username": "benchmark", "password": "benchmark123!"})),

    # Discover (public/optional auth)
    ("GET", "/api/v1/discover/hero", "Discover hero", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/sections", "Discover sections", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/movie/popular", "Discover movie popular", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/movie/top-rated", "Discover movie top-rated", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/movie/trending", "Discover movie trending", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/show/popular", "Discover show popular", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/show/top-rated", "Discover show top-rated", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/show/trending", "Discover show trending", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/game/popular", "Discover game popular", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/game/trending", "Discover game trending", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/music/popular", "Discover music popular", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/music/trending", "Discover music trending", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/discover/trailers/trending", "Discover trending trailers", False, lambda b, p: ({}, {})),

    # Media (public/optional auth)
    ("GET", "/api/v1/media/", "List media (all types)", False, lambda b, p: ({"limit": "5"}, {})),
    ("GET", "/api/v1/media/genres", "List genres", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/search/suggestions", "Search suggestions", False, lambda b, p: ({"q": "test", "limit": "3"}, {})),
    ("GET", "/api/v1/search", "Search media", False, lambda b, p: ({"q": "test", "page_size": "3"}, {})),
    ("GET", "/api/v1/search/grouped", "Search grouped", False, lambda b, p: ({"q": "test", "media_type_limit": "2"}, {})),
    ("GET", "/api/v1/media/certifications", "List certifications", False, lambda b, p: ({}, {})),
    ("GET", "/api/v1/media/company", "Get company by slug", False, lambda b, p: ({"slug": "nintendo"}, {})),
    ("GET", "/api/v1/search/companies", "Search companies", False, lambda b, p: ({"q": "nintendo", "limit": "3"}, {})),

    # People (public)
    ("GET", "/api/v1/people", "List people", False, lambda b, p: ({"limit": "5"}, {})),
    ("GET", "/api/v1/people/search", "Search people", False, lambda b, p: ({"q": "tom", "limit": "3"}, {})),

    # Company (public)
    ("GET", "/api/v1/company/{company_id}", "Get company detail", False, lambda b, p: ({"limit": "5"}, {"company_id": "1"})),

    # Library (most need auth — test tab as public-ish)
    ("GET", "/api/v1/library/movies", "Library tab: movies", False, lambda b, p: ({"limit": "5"}, {"tab": "movies"})),
    ("GET", "/api/v1/library/shows", "Library tab: shows", False, lambda b, p: ({"limit": "5"}, {"tab": "shows"})),
    ("GET", "/api/v1/library/games", "Library tab: games", False, lambda b, p: ({"limit": "5"}, {"tab": "games"})),
    ("GET", "/api/v1/library/music", "Library tab: music", False, lambda b, p: ({"limit": "5"}, {"tab": "music"})),

    # Push (vapid public key is public)
    ("GET", "/api/v1/push/vapid-public-key", "VAPID public key", False, lambda b, p: ({}, {})),

    # Media search/poll (public)
    ("GET", "/api/v1/search/poll", "Poll search updates", False, lambda b, p: ({"q": "test", "page_size": "5"}, {})),
    ("GET", "/api/v1/search/external", "Search external games", False, lambda b, p: ({"q": "zelda", "limit": "3"}, {})),
]


AUTH_ENDPOINTS: list[EndpointDef] = [
    # User profile
    ("GET", "/api/v1/users/me", "Get my profile", True, lambda b, p: ({}, {})),
    ("PATCH", "/api/v1/users/me", "Update my profile", True, lambda b, p: ({}, {"bio": "benchmark update"})),
    ("GET", "/api/v1/users/me/preferences", "Get preferences", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/me/integrations", "Get integrations", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/me/daily-activity", "Daily activity", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/me/continue", "Continue watching", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/me/friends/activity", "Friend feed", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/me/activity-heatmap", "Activity heatmap", True, lambda b, p: ({}, {})),

    # Friend routes
    ("GET", "/api/v1/friends", "List friends", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/friends/requests/incoming", "Incoming friend requests", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/friends/requests/outgoing", "Outgoing friend requests", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/friends/status/{user_id}", "Friendship status", True, lambda b, p: ({}, {"user_id": ""})),

    # Notifications
    ("GET", "/api/v1/notifications", "List notifications", True, lambda b, p: ({"limit": "5"}, {})),
    ("GET", "/api/v1/notifications/unread-count", "Unread count", True, lambda b, p: ({}, {})),

    # Mood check-ins
    ("GET", "/api/v1/mood-checkins/today", "Mood checkin today", True, lambda b, p: ({}, {})),

    # Users/{username} routes
    ("GET", "/api/v1/users/{username}", "User profile", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/reviews", "User reviews", True, lambda b, p: ({"limit": "3"}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/activity", "User activity", True, lambda b, p: ({"limit": "5"}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/mood-timeline", "Mood timeline", True, lambda b, p: ({"limit": "5"}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/stats", "User stats", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/top-rated", "User top rated", True, lambda b, p: ({"limit": "5"}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/hall-of-fame", "Hall of fame", True, lambda b, p: ({"limit": "5"}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/library-stats", "Library stats", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/karma", "User karma", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/karma/transactions", "Karma transactions", True, lambda b, p: ({"limit": "5"}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/badges", "User badges", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/rating", "User rating", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/reputation", "User reputation", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/{username}/rating-distribution", "Rating distribution", True, lambda b, p: ({}, {"username": "__self__"})),
    ("GET", "/api/v1/users/search", "Search users", True, lambda b, p: ({"q": "test", "limit": "3"}, {})),
    ("GET", "/api/v1/users/achievements", "Achievements list", True, lambda b, p: ({}, {})),

    # Follow routes
    ("POST", "/api/v1/users/follow", "Follow user (test)", True, lambda b, p: ({}, {"user_id": ""})),
    ("DELETE", "/api/v1/users/follow", "Unfollow user (test)", True, lambda b, p: ({"user_id": ""}, {})),
    ("GET", "/api/v1/users/follow/requests", "Follow requests", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/followers", "My followers", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/following", "My following", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/follow/counts", "Follow counts", True, lambda b, p: ({}, {})),
    ("GET", "/api/v1/users/follow/status", "Follow status", True, lambda b, p: ({}, {})),

    # Metrics
    ("GET", "/api/v1/users/metric", "User metrics", True, lambda b, p: ({}, {})),

    # Auth sessions
    ("GET", "/api/v1/auth/sessions", "List sessions", True, lambda b, p: ({}, {})),

    # Library (authenticated)
    ("GET", "/api/v1/library/installed", "Installed games", True, lambda b, p: ({"limit": "5"}, {})),

    # Push subscribe — test without subscription key (expects 422)
    ("POST", "/api/v1/push/subscribe", "Push subscribe (test)", True, lambda b, p: ({}, {})),

    # Track rating
    ("GET", "/api/v1/tracks/{track_id}/rating", "Track rating", True, lambda b, p: ({}, {"track_id": "1"})),

    # Upload
    ("POST", "/api/v1/upload", "Upload (empty — expect 422)", True, lambda b, p: ({}, {})),
]

# ── Endpoints that need specific known IDs ────────────────────────────

def build_catalog() -> list[tuple[str, str, str, bool, Any]]:
    return ANON_ENDPOINTS + AUTH_ENDPOINTS


async def get_token(client: httpx.AsyncClient) -> str | None:
    """Try to register or login as a benchmark user."""
    import random
    import string

    # First try login with an identity field (not username)
    resp = await client.post(
        make_url("/api/v1/auth/login"),
        json={"identity": "benchuser", "password": "Bench123!"},
    )
    if resp.status_code == 200:
        data = resp.json()
        if "access_token" in data:
            return data["access_token"]

    # Try register
    suffix = "".join(random.choices(string.ascii_lowercase, k=6))
    resp = await client.post(
        make_url("/api/v1/auth/register"),
        json={
            "username": f"bench_{suffix}",
            "email": f"bench_{suffix}@test.com",
            "password": "Bench123!",
            "confirm_password": "Bench123!",
            "date_of_birth": "1990-01-01",
        },
    )
    if resp.status_code in (200, 201):
        data = resp.json()
        if isinstance(data, dict) and "access_token" in data:
            return data["access_token"]
    return None


async def resolve_username(client: httpx.AsyncClient, token: str) -> str:
    """Get the current user's username from /me."""
    resp = await client.get(
        make_url("/api/v1/auth/me"),
        headers={"Authorization": f"Bearer {token}"},
    )
    if resp.status_code == 200:
        data = resp.json()
        return data.get("username", "") or data.get("user", {}).get("username", "")
    return ""


async def benchmark_endpoint(
    client: httpx.AsyncClient,
    method: str,
    path_template: str,
    description: str,
    params_fn,
    token: str | None,
    username: str = "",
) -> EndpointResult:
    params, path_params = params_fn(None, None)

    # Resolve special placeholders
    resolved = path_template
    for k, v in path_params.items():
        if v == "__self__":
            resolved = resolved.replace(f"{{{k}}}", username)
        elif v == "" and k == "user_id":
            resolved = resolved.replace(f"{{{k}}}", "nonexistent")
        else:
            resolved = resolved.replace(f"{{{k}}}", v)

    url = make_url(resolved)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    start = time.monotonic()
    try:
        if method == "GET":
            resp = await client.get(url, params=params, headers=headers)
        elif method == "POST":
            resp = await client.post(url, json=params if params else {}, headers=headers)
        elif method == "PUT":
            resp = await client.put(url, json=params if params else {}, headers=headers)
        elif method == "PATCH":
            resp = await client.patch(url, json=params if params else {}, headers=headers)
        elif method == "DELETE":
            resp = await client.delete(url, headers=headers)
        else:
            return EndpointResult(method, resolved, 0, 0, f"Unsupported method {method}")

        elapsed = (time.monotonic() - start) * 1000
        status = resp.status_code
        # 401/403/404/422 are acceptable for test data — only error on 5xx
        error = None
        if status >= 500:
            error = f"HTTP {status}: {resp.text[:200]}"
        return EndpointResult(method, resolved, status, elapsed, error)

    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        return EndpointResult(method, resolved, 0, elapsed, str(e))


async def main():
    global BASE_URL
    parser = argparse.ArgumentParser(description="API endpoint benchmark")
    parser.add_argument("--base-url", default=BASE_URL, help=f"Base URL (default: {BASE_URL})")
    parser.add_argument("--output", default=None, help="Output report file (default: stdout)")
    args = parser.parse_args()

    BASE_URL = args.base_url.rstrip("/")

    sections: dict[str, ReportSection] = {
        "health": ReportSection("Health & Readiness"),
        "auth": ReportSection("Auth"),
        "discover": ReportSection("Discover"),
        "search": ReportSection("Search"),
        "media": ReportSection("Media"),
        "people": ReportSection("People"),
        "company": ReportSection("Company"),
        "library": ReportSection("Library"),
        "user": ReportSection("User"),
        "notifications": ReportSection("Notifications"),
        "friends": ReportSection("Friends"),
        "follow": ReportSection("Follow"),
        "push": ReportSection("Push"),
        "tracks": ReportSection("Tracks"),
        "upload": ReportSection("Upload"),
        "mood": ReportSection("Mood"),
    }

    def classify(path: str) -> str:
        p = path.lower()
        if "health" in p or "healthz" in p:
            return "health"
        if "/auth/" in p:
            return "auth"
        if "/discover/" in p:
            return "discover"
        if "/search/" in p or p.endswith("/search"):
            return "search"
        if "/media/" in p or "/media" == p.split("?")[0].rstrip("/"):
            return "media"
        if "/people" in p:
            return "people"
        if "/company" in p:
            return "company"
        if "/library" in p:
            return "library"
        if "/users/" in p or "/user/" in p:
            return "user"
        if "/notifications" in p:
            return "notifications"
        if "/friends" in p:
            return "friends"
        if "/follow" in p:
            return "follow"
        if "/push" in p:
            return "push"
        if "/tracks" in p:
            return "tracks"
        if "/upload" in p:
            return "upload"
        if "/mood" in p:
            return "mood"
        return "other"

    headers = {"Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        # Step 1: Get auth token
        print("🔑 Authenticating...")
        token = await get_token(client)
        if token:
            print("✅ Authenticated successfully")
        else:
            print("⚠️  No auth token — skipping auth-required endpoints")

        # Step 2: Resolve own username
        bench_username = ""
        if token:
            bench_username = await resolve_username(client, token)
            print(f"👤 Username: {bench_username or 'unknown'}")

        # Step 3: Run benchmarks
        endpoints = build_catalog()
        all_results: list[EndpointResult] = []

        print(f"\n📊 Benchmarking {len(endpoints)} endpoints...\n")
        for i, (method, path, desc, needs_auth, params_fn) in enumerate(endpoints, 1):
            if needs_auth and not token:
                print(f"  [{i:3d}/{len(endpoints)}] SKIP (no auth) {method} {desc}")
                continue

            result = await benchmark_endpoint(
                client, method, path, desc, params_fn,
                token if needs_auth else None,
                bench_username,
            )
            cat = classify(result.path)
            if cat not in sections:
                sections[cat] = ReportSection(cat.capitalize())
            sections[cat].results.append(result)

            status_icon = "✅" if result.status and result.status < 500 else "⚠️"
            print(f"  [{i:3d}/{len(endpoints)}] {status_icon} {_fmt(result.elapsed_ms)} {method:6s} {desc}")
            all_results.append(result)

        # Step 4: Analysis report
        await generate_report(sections, all_results, args.output)


async def generate_report(
    sections: dict[str, ReportSection],
    all_results: list[EndpointResult],
    output: str | None,
):
    slow = [r for r in all_results if r.elapsed_ms >= WARN_MS and r.status >= 200 and r.status < 500]
    very_slow = [r for r in all_results if r.elapsed_ms >= CRIT_MS and r.status >= 200 and r.status < 500]
    errored = [r for r in all_results if r.error or (r.status >= 500)]
    skipped = len(all_results) - len([r for r in all_results if r.status or r.elapsed_ms > 0])

    times = [r.elapsed_ms for r in all_results if r.status and r.status < 500]
    avg_ms = statistics.mean(times) if times else 0
    med_ms = statistics.median(times) if times else 0
    p95_ms = sorted(times)[int(len(times) * 0.95)] if times else 0
    p99_ms = sorted(times)[int(len(times) * 0.99)] if times else 0

    lines: list[str] = []
    lines.append("# 🏎️ API Benchmark Report\n")
    lines.append(f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"**Base URL:** {BASE_URL}")
    lines.append(f"**Endpoints Tested:** {len(all_results)}")
    lines.append(f"**Skipped (no auth):** {skipped}\n")

    lines.append("## 📈 Summary Statistics\n")
    lines.append(f"| Metric | Value |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Average | `{avg_ms:.0f} ms` |")
    lines.append(f"| Median | `{med_ms:.0f} ms` |")
    lines.append(f"| P95 | `{p95_ms:.0f} ms` |")
    lines.append(f"| P99 | `{p99_ms:.0f} ms` |")
    lines.append(f"| Slow (>{WARN_MS}ms) | **{len(slow)}** endpoints |")
    lines.append(f"| Critical (>{CRIT_MS}ms) | **{len(very_slow)}** endpoints |")
    lines.append(f"| Errors (5xx) | **{len(errored)}** endpoints |\n")

    if very_slow:
        lines.append("## 🔴 Critical Performance Issues (>{0}ms)\n".format(CRIT_MS))
        lines.append("| Method | Path | Time |")
        lines.append("|--------|------|------|")
        for r in sorted(very_slow, key=lambda x: x.elapsed_ms, reverse=True):
            lines.append(f"| {r.method} | `{r.path}` | {r.elapsed_ms:.0f}ms |")
        lines.append("")

    if slow:
        lines.append("## ⚠️ Slow Endpoints (>{0}ms)\n".format(WARN_MS))
        lines.append("| Method | Path | Time |")
        lines.append("|--------|------|------|")
        for r in sorted(slow, key=lambda x: x.elapsed_ms, reverse=True):
            if r not in very_slow:
                lines.append(f"| {r.method} | `{r.path}` | {r.elapsed_ms:.0f}ms |")
        lines.append("")

    if errored:
        lines.append("## ❌ Errors\n")
        for r in errored:
            lines.append(f"- **{r.method}** `{r.path}` — {r.error}")
        lines.append("")

    lines.append("## 📊 Results by Category\n")
    for cat_name in ["discover", "search", "media", "people", "company", "library", "user", "auth", "friends", "follow", "notifications", "push", "tracks", "upload", "mood", "health"]:
        section = sections.get(cat_name)
        if not section or not section.results:
            continue

        section_times = [r.elapsed_ms for r in section.results if r.status and r.status < 500]
        if not section_times:
            continue

        avg_s = statistics.mean(section_times)
        med_s = statistics.median(section_times)
        max_s = max(section_times)

        lines.append(f"### {section.title}\n")
        lines.append(f"*Avg: {avg_s:.0f}ms | Median: {med_s:.0f}ms | Max: {max_s:.0f}ms*\n")
        lines.append("| Method | Path | Status | Time |")
        lines.append("|--------|------|--------|------|")
        for r in sorted(section.results, key=lambda x: x.elapsed_ms, reverse=True):
            status_str = str(r.status) if r.status else "ERR"
            lines.append(f"| {r.method} | `{r.path}` | {status_str} | {_fmt(r.elapsed_ms)} |")
        lines.append("")

    lines.append("## 🛠️ Optimization Opportunities\n")

    # Analyze slow patterns
    slow_discover = [r for r in all_results if "/discover/" in r.path and r.elapsed_ms >= WARN_MS]
    slow_search = [r for r in all_results if "/search" in r.path and r.elapsed_ms >= WARN_MS]
    slow_library = [r for r in all_results if "/library/" in r.path and r.elapsed_ms >= WARN_MS]
    slow_user = [r for r in all_results if "/users/" in r.path and r.elapsed_ms >= WARN_MS]

    if slow_search:
        lines.append("### 1. Search Endpoints\n")
        lines.append("Search queries are slow because they call embedding APIs (pgvector similarity) and join across tables.")
        lines.append("Consider:")
        lines.append("- **Warming the embedding model cache** (already done at startup — verify it's working)")
        lines.append("- **Adding Redis caching with longer TTL** for popular queries")
        lines.append("- **Using materialized search views** in Postgres for frequent query patterns")
        lines.append("- **Async pre-computation of embeddings** via Celery when new media is added\n")

    if slow_discover:
        lines.append("### 2. Discover Endpoints\n")
        lines.append("Discover pages aggregate multiple queries. Optimization options:")
        lines.append("- **Pre-compute popular/trending/rated lists** in background tasks")
        lines.append("- **Use Redis sorted sets** with ZADD/ZRANK for trending computation")
        lines.append("- **Add a materialized cache table** in Postgres refreshed by cron\n")

    if slow_library:
        lines.append("### 3. Library Endpoints\n")
        lines.append("Library queries join user state + media catalog + external provider status.")
        lines.append("Consider:")
        lines.append("- **Denormalizing user interaction counts** directly on media rows")
        lines.append("- **Separate read models** for library views vs. catalog views")
        lines.append("- **Pagination tuning**: ensure cursor-based pagination uses indexes\n")

    # General
    lines.append("### 4. General Optimization\n")
    lines.append("| Issue | Suggestion |")
    lines.append("|-------|-----------|")
    lines.append("| N+1 queries | Audit service layer for lazy-loaded relationships (use selectinload eagerly) |")
    lines.append("| Missing indexes | Check EXPLAIN ANALYZE on slow queries — look for sequential scans on large tables |")
    lines.append("| Serial embedding calls | Ensure `_call_embed_query` is non-blocking and connection-pooled |")
    lines.append("| Unbatched DB calls | Batch external ID lookups (many endpoints do this per-item) |")
    lines.append("| Hot Redis keys | Check `media:detail:*` TTL — 30s may be too short for popular items |")
    lines.append("| Celery task overhead | Import-in-path endpoints fire Celery per-game — batch where possible |")
    lines.append("| No CDN for uploads | Static files served from Python — offload to nginx/CloudFront |\n")

    lines.append("### 5. Auth Hot Path\n")
    lines.append("| Endpoint | Concern |")
    lines.append("|----------|---------|")
    lines.append("| POST /auth/login | bcrypt comparison + JWT signing — ensure index on username |")
    lines.append("| POST /auth/refresh | Token rotation adds DB writes — batch cleanup of old tokens |")
    lines.append("| All auth-required | JWT decode per request — minimal overhead but time spent in middleware |\n")

    report = "\n".join(lines)

    if output:
        with open(output, "w") as f:
            f.write(report)
        print(f"\n📄 Report written to {output}")
    else:
        print("\n" + report)


if __name__ == "__main__":
    asyncio.run(main())
