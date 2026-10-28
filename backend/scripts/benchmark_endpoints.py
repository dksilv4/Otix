#!/usr/bin/env python3
"""Automated Django REST micro-benchmarking harness for Phase 1 baseline audit.

Measures query counts, cumulative DB execution time, latency distributions
(p50, p95, p99, min, max), and memory allocation across targeted bottleneck
endpoints:
1. /api/v1/users/me/friends/activity (1 + 3N friend activity N+1 query explosion)
2. /api/v1/media (Media listing N+1 query explosion in enrich_summaries)
3. /api/v1/media/{type}/{id} (Media detail 17+ baseline query fanout)
4. /api/v1/chat/conversations (Per-conversation unread count N+1 query pattern)
5. /api/v1/users/{username} (User profile & 3-query unindexed XP rank calculation)

Runs hermetically under `DJANGO_SETTINGS_MODULE=config.settings.test` with an
in-memory SQLite database.
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import statistics
import sys
import time
import tracemalloc
from typing import Any, Callable

# Ensure backend root is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")

import django

django.setup()

from django.core.cache import cache
from django.core.management import call_command
from django.db import connection, reset_queries
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

# Domain models
from apps.accounts.models import User
from apps.accounts.views import UserDetailView
from apps.chat.models import Conversation, ConversationParticipant, Message
from apps.chat.views import ConversationListCreateView
from apps.lists.models import Collection
from apps.media.models import MediaItem, Movie
from apps.media.views import MediaDetailView, MediaListView
from apps.social.models import (
    FriendRequest,
    Review,
    UserMediaInteraction,
)
from apps.social.services.xp import calculate_xp_rank_and_percentile
from apps.social.views import FriendsActivityView


def bootstrap_database() -> None:
    """Run migrations to prepare hermetic in-memory SQLite schema."""
    call_command("migrate", verbosity=0)


def run_micro_benchmark(
    name: str,
    endpoint_func: Callable[[], Any],
    iterations: int = 30,
    warmup: int = 5,
) -> dict[str, Any]:
    """Execute micro-benchmark measuring queries, DB time, latency, and memory."""
    # 1. Warm-up iterations
    for _ in range(warmup):
        endpoint_func()

    # 2. Query count and DB execution time measurement
    reset_queries()
    with CaptureQueriesContext(connection) as ctx:
        endpoint_func()

    query_count = len(ctx)
    db_time_ms = sum(float(q.get("time", 0.0)) for q in ctx) * 1000.0
    queries_sample = [q.get("sql", "")[:120] for q in ctx[:5]]

    # 3. Peak memory measurement via tracemalloc
    gc.collect()
    tracemalloc.start()
    endpoint_func()
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    # 4. Latency distribution measurement
    latencies: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter_ns()
        endpoint_func()
        t1 = time.perf_counter_ns()
        latencies.append((t1 - t0) / 1_000_000.0)  # Convert ns to ms

    latencies.sort()
    p50 = statistics.median(latencies)
    p95_idx = min(int(iterations * 0.95), iterations - 1)
    p99_idx = min(int(iterations * 0.99), iterations - 1)
    p95 = latencies[p95_idx]
    p99 = latencies[p99_idx]
    min_lat = min(latencies)
    max_lat = max(latencies)
    mean_lat = statistics.mean(latencies)
    stdev_lat = statistics.stdev(latencies) if len(latencies) > 1 else 0.0

    return {
        "name": name,
        "query_count": query_count,
        "db_time_ms": round(db_time_ms, 3),
        "peak_memory_kib": round(peak_mem / 1024.0, 2),
        "current_memory_kib": round(current_mem / 1024.0, 2),
        "iterations": iterations,
        "min_ms": round(min_lat, 3),
        "p50_ms": round(p50, 3),
        "p95_ms": round(p95, 3),
        "p99_ms": round(p99, 3),
        "max_ms": round(max_lat, 3),
        "mean_ms": round(mean_lat, 3),
        "stddev_ms": round(stdev_lat, 3),
        "queries_sample": queries_sample,
    }


# =============================================================================
# Benchmark 1: Friends Activity Feed (1 + 3N pattern)
# =============================================================================


def benchmark_friends_activity(iterations: int = 30) -> list[dict[str, Any]]:
    """Benchmark /api/v1/users/me/friends/activity with 5, 10, and 20 friends."""
    results: list[dict[str, Any]] = []
    factory = APIRequestFactory()
    view = FriendsActivityView.as_view()

    # Part A: Measure with activity data per friend (verifying realistic prefetch fanout)
    for num_friends in [5, 10, 20]:
        # Clean state
        User.objects.all().delete()
        FriendRequest.objects.all().delete()
        Review.objects.all().delete()
        UserMediaInteraction.objects.all().delete()
        cache.clear()

        alice = User.objects.create_user(username="alice", password="password123")
        movie = MediaItem.objects.create(
            media_type="movie", title="Sample Activity Movie", slug=f"activity-movie-{num_friends}"
        )

        for i in range(num_friends):
            friend = User.objects.create_user(
                username=f"friend_{num_friends}_{i}", password="password123"
            )
            FriendRequest.objects.create(sender=alice, receiver=friend, status="accepted")
            Review.objects.create(
                user=friend, media_item=movie, content=f"Review from friend {i}"
            )
            UserMediaInteraction.objects.create(
                user=friend, media_item=movie, interaction_type="watched"
            )

        def call_endpoint() -> Any:
            req = factory.get("/api/v1/users/me/friends/activity?limit=20")
            force_authenticate(req, user=alice)
            return view(req)

        res = run_micro_benchmark(
            name=f"/api/friends/activity ({num_friends} friends, with activity events)",
            endpoint_func=call_endpoint,
            iterations=iterations,
        )
        res["friends_count"] = num_friends
        results.append(res)

    # Part B: Measure with zero activity events (verifying the exact 1 + 3N query explosion)
    for num_friends in [5, 10, 20]:
        User.objects.all().delete()
        FriendRequest.objects.all().delete()
        cache.clear()

        alice = User.objects.create_user(username="alice", password="password123")
        for i in range(num_friends):
            friend = User.objects.create_user(
                username=f"friend_empty_{num_friends}_{i}", password="password123"
            )
            FriendRequest.objects.create(sender=alice, receiver=friend, status="accepted")

        def call_endpoint_empty() -> Any:
            req = factory.get("/api/v1/users/me/friends/activity?limit=20")
            force_authenticate(req, user=alice)
            return view(req)

        res = run_micro_benchmark(
            name=f"/api/friends/activity ({num_friends} friends, exact 1 + 3N pattern)",
            endpoint_func=call_endpoint_empty,
            iterations=iterations,
        )
        res["friends_count"] = num_friends
        results.append(res)

    return results


# =============================================================================
# Benchmark 2: Media Listing (N+1 in enrich_summaries with collection)
# =============================================================================


def benchmark_media_listing(iterations: int = 30) -> list[dict[str, Any]]:
    """Benchmark /api/v1/media with 20 items where movies have collections."""
    User.objects.all().delete()
    MediaItem.objects.all().delete()
    Collection.objects.all().delete()
    Movie.objects.all().delete()
    cache.clear()

    col1 = Collection.objects.create(name="Trilogy Alpha")
    col2 = Collection.objects.create(name="Trilogy Beta")

    # Create 20 movie items belonging to collections
    for i in range(20):
        item = MediaItem.objects.create(
            media_type="movie",
            title=f"Benchmark Film {i:02d}",
            slug=f"benchmark-film-{i:02d}",
        )
        col = col1 if i < 10 else col2
        Movie.objects.create(media_item=item, collection=col)

    factory = APIRequestFactory()
    view = MediaListView.as_view()

    def call_endpoint() -> Any:
        req = factory.get("/api/v1/media?limit=20")
        return view(req)

    res = run_micro_benchmark(
        name="/api/media (20 items with movie collection enrichment)",
        endpoint_func=call_endpoint,
        iterations=iterations,
    )
    res["items_count"] = 20
    return [res]


# =============================================================================
# Benchmark 3: Media Detail (17+ baseline query fanout)
# =============================================================================


def benchmark_media_detail(iterations: int = 30) -> list[dict[str, Any]]:
    """Benchmark /api/v1/media/{type}/{id} detail retrieval fanout."""
    MediaItem.objects.all().delete()
    Collection.objects.all().delete()
    Movie.objects.all().delete()
    cache.clear()

    col = Collection.objects.create(name="Classic Trilogy")
    item = MediaItem.objects.create(
        media_type="movie",
        title="Detail Benchmark Feature Film",
        slug="detail-benchmark-film",
    )
    Movie.objects.create(media_item=item, collection=col)

    factory = APIRequestFactory()
    view = MediaDetailView.as_view()

    def call_endpoint() -> Any:
        # Clear cache so we measure the full ORM query fanout, not cache retrieval
        cache.clear()
        req = factory.get(f"/api/v1/media/movie/{item.id}")
        return view(req, media_type="movie", media_id=str(item.id))

    res = run_micro_benchmark(
        name="/api/media/{id} (single item detail retrieval)",
        endpoint_func=call_endpoint,
        iterations=iterations,
    )
    res["media_id"] = item.id
    return [res]


# =============================================================================
# Benchmark 4: Chat Conversations (unread count queries per conversation)
# =============================================================================


def benchmark_chat_conversations(iterations: int = 30) -> list[dict[str, Any]]:
    """Benchmark /api/v1/chat/conversations with 5, 10, and 20 conversations."""
    results: list[dict[str, Any]] = []
    factory = APIRequestFactory()
    view = ConversationListCreateView.as_view()

    for num_convs in [5, 10, 20]:
        User.objects.all().delete()
        Conversation.objects.all().delete()
        ConversationParticipant.objects.all().delete()
        Message.objects.all().delete()
        cache.clear()

        alice = User.objects.create_user(username="alice", password="password123")

        for i in range(num_convs):
            bob = User.objects.create_user(
                username=f"chat_peer_{num_convs}_{i}", password="password123"
            )
            conv = Conversation.objects.create(type="direct")
            ConversationParticipant.objects.create(
                conversation=conv, user=alice, last_read_message_id=0
            )
            ConversationParticipant.objects.create(conversation=conv, user=bob)
            # Create incoming messages to be counted by get_unread_count
            Message.objects.create(
                conversation=conv, sender=bob, content=f"Hello message from bob {i}"
            )

        def call_endpoint() -> Any:
            req = factory.get("/api/v1/chat/conversations")
            force_authenticate(req, user=alice)
            return view(req)

        res = run_micro_benchmark(
            name=f"/api/chat/conversations ({num_convs} conversations, unread count queries)",
            endpoint_func=call_endpoint,
            iterations=iterations,
        )
        res["conversations_count"] = num_convs
        results.append(res)

    return results


# =============================================================================
# Benchmark 5: User Detail & XP Rank Calculation (unindexed table scans)
# =============================================================================


def benchmark_user_detail_and_xp(iterations: int = 30) -> list[dict[str, Any]]:
    """Benchmark /api/v1/users/{username} and isolated XP rank / percentile calculation."""
    results: list[dict[str, Any]] = []
    factory = APIRequestFactory()
    view = UserDetailView.as_view()

    for user_pop in [50, 100, 500]:
        User.objects.all().delete()
        cache.clear()

        users: list[User] = []
        for i in range(user_pop):
            users.append(
                User(
                    username=f"pop_user_{user_pop}_{i}",
                    is_active=True,
                    total_xp=i * 25,
                )
            )
        User.objects.bulk_create(users)
        target_user = User.objects.get(username=f"pop_user_{user_pop}_{user_pop // 2}")

        # Benchmark 5A: Full UserDetailView endpoint
        def call_endpoint() -> Any:
            req = factory.get(f"/api/v1/users/{target_user.username}")
            return view(req, username=target_user.username)

        res_endpoint = run_micro_benchmark(
            name=f"/api/users/{{username}} (population {user_pop} users)",
            endpoint_func=call_endpoint,
            iterations=iterations,
        )
        res_endpoint["user_population"] = user_pop
        results.append(res_endpoint)

        # Benchmark 5B: Isolated calculate_xp_rank_and_percentile service call
        def call_xp() -> Any:
            return calculate_xp_rank_and_percentile(target_user)

        res_xp = run_micro_benchmark(
            name=f"calculate_xp_rank_and_percentile (population {user_pop} users)",
            endpoint_func=call_xp,
            iterations=iterations,
        )
        res_xp["user_population"] = user_pop
        results.append(res_xp)

    return results


# =============================================================================
# CLI and Report Generation
# =============================================================================


def format_table(benchmarks: list[dict[str, Any]]) -> str:
    """Format benchmark results into a clean markdown table."""
    headers = [
        "Target Benchmark",
        "Queries",
        "DB Time (ms)",
        "p50 (ms)",
        "p95 (ms)",
        "Min (ms)",
        "Max (ms)",
        "Peak Mem (KiB)",
    ]
    col_widths = [max(len(h), 50) if i == 0 else max(len(h), 12) for i, h in enumerate(headers)]

    lines = []
    # Header
    header_row = "| " + " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers)) + " |"
    sep_row = "|-" + "-|-".join("-" * col_widths[i] for i in range(len(headers))) + "-|"
    lines.append(header_row)
    lines.append(sep_row)

    for b in benchmarks:
        row = [
            b["name"].ljust(col_widths[0]),
            str(b["query_count"]).rjust(col_widths[1]),
            f"{b['db_time_ms']:.3f}".rjust(col_widths[2]),
            f"{b['p50_ms']:.3f}".rjust(col_widths[3]),
            f"{b['p95_ms']:.3f}".rjust(col_widths[4]),
            f"{b['min_ms']:.3f}".rjust(col_widths[5]),
            f"{b['max_ms']:.3f}".rjust(col_widths[6]),
            f"{b['peak_memory_kib']:.2f}".rjust(col_widths[7]),
        ]
        lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Otix Django REST Micro-Benchmark Runner")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--iterations", type=int, default=30, help="Iterations per benchmark (default: 30)")
    parser.add_argument("--output", type=str, default="", help="Optional output path to save markdown report")
    args = parser.parse_args()

    print("================================================================================")
    print("      OTIX BACKEND DJANGO REST MICRO-BENCHMARK HARNESS (PHASE 1 BASELINE)       ")
    print("================================================================================")
    print("Bootstrapping test environment and in-memory database schema...")
    bootstrap_database()
    print("Database schema initialized successfully.\n")

    all_results: list[dict[str, Any]] = []

    print("[1/5] Benchmarking /api/friends/activity (1 + 3N query explosion pattern)...")
    res_friends = benchmark_friends_activity(iterations=args.iterations)
    all_results.extend(res_friends)

    print("[2/5] Benchmarking /api/media (20 items collection enrichment N+1)...")
    res_media = benchmark_media_listing(iterations=args.iterations)
    all_results.extend(res_media)

    print("[3/5] Benchmarking /api/media/{id} (17+ baseline query fanout)...")
    res_detail = benchmark_media_detail(iterations=args.iterations)
    all_results.extend(res_detail)

    print("[4/5] Benchmarking /api/chat/conversations (unread count queries per conv)...")
    res_chat = benchmark_chat_conversations(iterations=args.iterations)
    all_results.extend(res_chat)

    print("[5/5] Benchmarking /api/users/{username} & calculate_xp_rank_and_percentile...")
    res_users = benchmark_user_detail_and_xp(iterations=args.iterations)
    all_results.extend(res_users)

    print("\n================================================================================")
    print("                                BENCHMARK REPORT                                ")
    print("================================================================================\n")
    table_str = format_table(all_results)
    print(table_str)

    if args.json:
        print("\nJSON Output:")
        print(json.dumps(all_results, indent=2))

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write("# Otix Backend REST Baseline Benchmark Report\n\n")
            f.write(f"**Date**: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n")
            f.write(f"**Iterations per benchmark**: {args.iterations}\n\n")
            f.write("## Baseline Measurement Results\n\n")
            f.write(table_str)
            f.write("\n\n## Raw JSON Data\n\n```json\n")
            f.write(json.dumps(all_results, indent=2))
            f.write("\n```\n")
        print(f"\nReport written to: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
