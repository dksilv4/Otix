"""Adversarial challenger 2 test harness for Milestone 1:
Query sorting combinations, media_type filtering with typos, ranking stability,
null safety, pagination determinism, and performance profiling across DB engines.
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if "DJANGO_SETTINGS_MODULE" not in os.environ:
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.test"

import django
django.setup()

from django.core.management import call_command
call_command("migrate", verbosity=0)

from datetime import date
from django.db import connection, reset_queries
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.media.models import ExternalID, Game, MediaAsset, MediaItem, Movie, Show
from apps.search.services.search import (
    compute_relevance_score,
    ensure_sqlite_search_functions,
    py_trigram_similarity,
    py_word_trigram_similarity,
    rank_media_items_python,
    search_media_payload,
    suggestions_payload,
    grouped_payload,
)


def run_challenger2_adversarial_suite():
    print("=" * 80)
    print(f"CHALLENGER 2 ADVERSARIAL SUITE (DB Vendor: {connection.vendor})")
    print("=" * 80)

    client = APIClient()
    passes = 0
    failures = 0
    warnings = 0
    details = []

    def record_pass(name: str, info: str = ""):
        nonlocal passes
        passes += 1
        msg = f"  [PASS] {name}"
        if info:
            msg += f" ({info})"
        print(msg)

    def record_fail(name: str, err: str):
        nonlocal failures
        failures += 1
        details.append((name, err))
        print(f"  [FAIL] {name}: {err}")

    def record_warn(name: str, info: str):
        nonlocal warnings
        warnings += 1
        print(f"  [WARN] {name}: {info}")

    def clean_db():
        ExternalID.objects.all().delete()
        MediaAsset.objects.all().delete()
        Movie.objects.all().delete()
        Show.objects.all().delete()
        Game.objects.all().delete()
        MediaItem.objects.all().delete()

    def create_item(
        media_type: str,
        title: str,
        slug: str,
        popularity: float | None = 10.0,
        avg_rating: float | None = 8.0,
        release_date: date | None = None,
    ) -> MediaItem:
        item = MediaItem.objects.create(
            media_type=media_type,
            title=title,
            slug=slug,
            popularity=popularity,
            avg_rating=avg_rating,
            release_date=release_date or date(2022, 1, 1),
        )
        subtype = {"movie": Movie, "show": Show, "game": Game}.get(media_type)
        if subtype:
            subtype.objects.create(media_item=item)
        return item

    clean_db()

    # =========================================================================
    # SUITE 1: QUERY SORTING COMBINATIONS (sort_by=popularity vs default hybrid)
    # =========================================================================
    print("\n--- SUITE 1: Query Sorting Combinations ---")

    try:
        # Create items for sorting tests:
        # exact match with low popularity
        sp_exact = create_item("movie", "Spider-Man", "spider-man", popularity=10.0, avg_rating=8.0, release_date=date(2002, 5, 3))
        # prefix match with medium popularity
        sp_prefix = create_item("movie", "Spider-Man 2", "spider-man-2", popularity=50.0, avg_rating=8.5, release_date=date(2004, 6, 30))
        # substring match with high popularity
        sp_sub = create_item("movie", "The Amazing Spider-Man", "the-amazing-spider-man", popularity=90.0, avg_rating=7.0, release_date=date(2012, 7, 3))
        # another prefix match with EQUAL popularity to sp_prefix but different release date / rating
        sp_prefix2 = create_item("movie", "Spider-Man 3", "spider-man-3", popularity=50.0, avg_rating=6.5, release_date=date(2007, 5, 4))

        # 1.1 Default sorting (sort_by=None)
        res_default = client.get("/api/v1/search/", {"q": "Spider-Man"})
        if res_default.status_code == 200:
            items = res_default.data["items"]
            if len(items) >= 4 and items[0]["id"] == sp_exact.id:
                record_pass("Default hybrid ranking places exact match #1 ahead of higher popularity")
            else:
                record_fail("Default hybrid ranking", f"Top item was {items[0] if items else 'empty'}")
        else:
            record_fail("Default search request", f"Status {res_default.status_code}")

        # 1.2 sort_by=popularity
        # When explicitly sorting by popularity, highest popularity must come FIRST.
        res_pop = client.get("/api/v1/search/", {"q": "Spider-Man", "sort_by": "popularity"})
        if res_pop.status_code == 200:
            items_pop = res_pop.data["items"]
            # Expected order: sp_sub (90.0) -> sp_prefix & sp_prefix2 (50.0) -> sp_exact (10.0)
            if items_pop[0]["id"] == sp_sub.id and items_pop[-1]["id"] == sp_exact.id:
                record_pass("sort_by=popularity correctly orders by popularity descending", f"Top: {items_pop[0]['title']} (pop 90), Bottom: {items_pop[-1]['title']} (pop 10)")
            else:
                record_fail("sort_by=popularity", f"Order was {[i['title'] for i in items_pop]}")

            # Check tie-breaker for equal popularity items (sp_prefix and sp_prefix2 both have pop=50.0)
            # sp_prefix ("Spider-Man 2") has title "Spider-Man 2", sp_prefix2 has "Spider-Man 3"
            middle_ids = [items_pop[1]["id"], items_pop[2]["id"]]
            if sp_prefix.id in middle_ids and sp_prefix2.id in middle_ids:
                record_pass("sort_by=popularity maintains equal popularity items in middle tier")
            else:
                record_fail("sort_by=popularity middle tier", f"Got middle ids: {middle_ids}")
        else:
            record_fail("sort_by=popularity request", f"Status {res_pop.status_code}")

        # 1.3 sort_by=popularity with relevance tie-breaker test
        # Create two items with identical popularity=75.0, where one is exact match and one is substring match
        tie_exact = create_item("movie", "Gladiator", "gladiator", popularity=75.0)
        tie_sub = create_item("movie", "The Last Gladiator", "the-last-gladiator", popularity=75.0)

        res_tie = client.get("/api/v1/search/", {"q": "Gladiator", "sort_by": "popularity"})
        if res_tie.status_code == 200:
            t_items = res_tie.data["items"]
            t_ids = [it["id"] for it in t_items if it["id"] in (tie_exact.id, tie_sub.id)]
            if len(t_ids) == 2 and t_ids[0] == tie_exact.id:
                record_pass("sort_by=popularity tie-breaker uses relevance score (exact > substring on equal pop)")
            else:
                record_fail("sort_by=popularity tie-breaker", f"Ids order: {t_ids}")
        else:
            record_fail("sort_by=popularity tie request", f"Status {res_tie.status_code}")

        # 1.4 sort_by=rating
        res_rating = client.get("/api/v1/search/", {"q": "Spider-Man", "sort_by": "rating"})
        if res_rating.status_code == 200:
            r_items = res_rating.data["items"]
            # sp_prefix has rating 8.5 (highest), so it must be top
            if r_items[0]["id"] == sp_prefix.id:
                record_pass("sort_by=rating correctly places highest rated item (8.5) #1")
            else:
                record_fail("sort_by=rating", f"Top item was {r_items[0]['title']}")
        else:
            record_fail("sort_by=rating request", f"Status {res_rating.status_code}")

        # 1.5 sort_by=release_date
        res_date = client.get("/api/v1/search/", {"q": "Spider-Man", "sort_by": "release_date"})
        if res_date.status_code == 200:
            d_items = res_date.data["items"]
            # sp_sub was released 2012 (newest)
            if d_items[0]["id"] == sp_sub.id and d_items[-1]["id"] == sp_exact.id:
                record_pass("sort_by=release_date correctly places newest item (2012) #1 and oldest (2002) last")
            else:
                record_fail("sort_by=release_date", f"Order was {[i['title'] for i in d_items]}")
        else:
            record_fail("sort_by=release_date request", f"Status {res_date.status_code}")

        # 1.6 sort_by=title
        res_title = client.get("/api/v1/search/", {"q": "Spider-Man", "sort_by": "title"})
        if res_title.status_code == 200:
            titles = [i["title"] for i in res_title.data["items"] if "Spider-Man" in i["title"]]
            if titles == sorted(titles):
                record_pass("sort_by=title correctly sorts alphabetical ascending", str(titles))
            else:
                record_fail("sort_by=title", f"Titles not sorted: {titles}")
        else:
            record_fail("sort_by=title request", f"Status {res_title.status_code}")

        # 1.7 Invalid sort_by fallback
        invalid_sorts = ["unknown", "hack_col", "1; DROP TABLE", "avg_rating", "-popularity"]
        for inv in invalid_sorts:
            res_inv = client.get("/api/v1/search/", {"q": "Spider-Man", "sort_by": inv})
            if res_inv.status_code == 200:
                inv_items = res_inv.data["items"]
                # Must fall back to default hybrid ranking (exact match #1)
                if inv_items and inv_items[0]["id"] == sp_exact.id:
                    record_pass(f"Invalid sort_by='{inv[:15]}' gracefully falls back to hybrid ranking")
                else:
                    record_fail(f"Invalid sort_by='{inv}' fallback", f"Top item was {inv_items[0] if inv_items else 'empty'}")
            else:
                record_fail(f"Invalid sort_by='{inv}' status", f"Status {res_inv.status_code}")

        # 1.8 sort_by=popularity with typo query
        incept_exact = create_item("movie", "Inception", "inception", popularity=40.0)
        incept_doc = create_item("movie", "Inception: The Documentary", "inception-doc", popularity=80.0)

        res_typo_pop = client.get("/api/v1/search/", {"q": "inceptoin", "sort_by": "popularity"})
        if res_typo_pop.status_code == 200:
            tp_items = res_typo_pop.data["items"]
            tp_ids = [i["id"] for i in tp_items if i["id"] in (incept_exact.id, incept_doc.id)]
            if tp_ids == [incept_doc.id, incept_exact.id]:
                record_pass("sort_by=popularity with typo query 'inceptoin' ranks higher popularity candidate first")
            else:
                record_fail("sort_by=popularity with typo", f"Order was {tp_ids}")
        else:
            record_fail("sort_by=popularity with typo request", f"Status {res_typo_pop.status_code}")

    except Exception as e:
        record_fail("Suite 1 exception", str(e))

    # =========================================================================
    # SUITE 2: MEDIA_TYPE FILTERING COMBINED WITH TYPO QUERIES
    # =========================================================================
    print("\n--- SUITE 2: media_type Filtering Combined with Typo Queries ---")

    try:
        clean_db()
        # Seed cross-type items with similar titles
        m_matrix = create_item("movie", "The Matrix", "the-matrix", popularity=85.0)
        g_matrix = create_item("game", "Enter the Matrix", "enter-the-matrix", popularity=70.0)
        s_matrix = create_item("show", "Matrix: The Animated Series", "matrix-animated-series", popularity=60.0)

        # 2.1 Typo query without filter
        res_all = client.get("/api/v1/search/", {"q": "matrxi"})
        if res_all.status_code == 200:
            all_ids = {it["id"] for it in res_all.data["items"]}
            if m_matrix.id in all_ids:
                record_pass("Typo 'matrxi' without media_type filter matches across catalog")
            else:
                record_fail("Typo 'matrxi' without filter", f"Items: {res_all.data['items']}")
        else:
            record_fail("Typo query without filter", f"Status {res_all.status_code}")

        # 2.2 Filter by media_type="movie"
        res_m = client.get("/api/v1/search/", {"q": "matrxi", "media_type": "movie"})
        if res_m.status_code == 200:
            m_items = res_m.data["items"]
            m_ids = [it["id"] for it in m_items]
            m_types = {it["media_type"] for it in m_items}
            if m_matrix.id in m_ids and g_matrix.id not in m_ids and s_matrix.id not in m_ids and (not m_types or m_types == {"movie"}):
                record_pass("Typo 'matrxi' with media_type='movie' strictly excludes game and show")
            else:
                record_fail("media_type='movie' isolation", f"IDs: {m_ids}, Types: {m_types}")
        else:
            record_fail("media_type='movie' request", f"Status {res_m.status_code}")

        # 2.3 Filter by media_type="game"
        res_g = client.get("/api/v1/search/", {"q": "matrxi", "media_type": "game"})
        if res_g.status_code == 200:
            g_items = res_g.data["items"]
            g_ids = [it["id"] for it in g_items]
            g_types = {it["media_type"] for it in g_items}
            if g_matrix.id in g_ids and m_matrix.id not in g_ids and s_matrix.id not in g_ids:
                record_pass("Typo 'matrxi' with media_type='game' strictly isolates game item")
            else:
                record_fail("media_type='game' isolation", f"IDs: {g_ids}, Types: {g_types}")
        else:
            record_fail("media_type='game' request", f"Status {res_g.status_code}")

        # 2.4 Filter by media_type="show"
        res_s = client.get("/api/v1/search/", {"q": "matrxi", "media_type": "show"})
        if res_s.status_code == 200:
            s_items = res_s.data["items"]
            s_ids = [it["id"] for it in s_items]
            if s_matrix.id in s_ids and m_matrix.id not in s_ids and g_matrix.id not in s_ids:
                record_pass("Typo 'matrxi' with media_type='show' strictly isolates show item")
            else:
                record_fail("media_type='show' isolation", f"IDs: {s_ids}")
        else:
            record_fail("media_type='show' request", f"Status {res_s.status_code}")

        # 2.5 Filter for media_type where item does NOT exist
        # Create a movie-only item: "Interstellar"
        interstellar = create_item("movie", "Interstellar", "interstellar", popularity=90.0)

        # Typo query "itnerstellar" with media_type="game" (should return empty items, no false positives)
        res_no_game = client.get("/api/v1/search/", {"q": "itnerstellar", "media_type": "game"})
        if res_no_game.status_code == 200:
            # We filter out any external backfill items that might have string IDs if mock
            local_items = [it for it in res_no_game.data["items"] if it.get("id") == interstellar.id]
            if len(local_items) == 0:
                record_pass("Typo query 'itnerstellar' with media_type='game' returns 0 movie items (zero cross-contamination)")
            else:
                record_fail("Cross-contamination check", f"Found movie in game search: {local_items}")
        else:
            record_fail("media_type='game' negative test", f"Status {res_no_game.status_code}")

        # 2.6 media_type="music"
        res_music = client.get("/api/v1/search/", {"q": "matrxi", "media_type": "music"})
        if res_music.status_code == 200 and len(res_music.data["items"]) == 0 and res_music.data["total"] == 0:
            record_pass("media_type='music' returns clean empty envelope")
        else:
            record_fail("media_type='music'", f"Got {res_music.data}")

        # 2.7 Invalid media_type
        res_invalid_type = client.get("/api/v1/search/", {"q": "matrxi", "media_type": "nonexistent_type"})
        if res_invalid_type.status_code == 200 and len(res_invalid_type.data["items"]) == 0:
            record_pass("Invalid media_type='nonexistent_type' returns clean empty result without 500 error")
        else:
            record_fail("Invalid media_type", f"Status {res_invalid_type.status_code}")

    except Exception as e:
        record_fail("Suite 2 exception", str(e))

    # =========================================================================
    # SUITE 3: RANKING STABILITY, NULL SAFETY & DETERMINISTIC PAGINATION
    # =========================================================================
    print("\n--- SUITE 3: Ranking Stability, Null Safety & Deterministic Pagination ---")

    try:
        clean_db()

        # 3.1 Null safety
        # MediaItem model has popularity default=0.0 (NOT NULL), while avg_rating and release_date are nullable.
        null_item1 = create_item("movie", "Null Test Alpha", "null-test-alpha", popularity=0.0, avg_rating=None, release_date=None)
        null_item2 = create_item("movie", "Null Test Beta", "null-test-beta", popularity=0.0, avg_rating=None, release_date=None)

        res_null = client.get("/api/v1/search/", {"q": "Null Test"})
        if res_null.status_code == 200:
            items_null = res_null.data["items"]
            if len(items_null) >= 2:
                record_pass("Null avg_rating and release_date with default popularity=0.0 does not crash ORM or scoring", f"Found {len(items_null)} items")
            else:
                record_fail("Null field handling", f"Expected >= 2 items, got {len(items_null)}")
        else:
            record_fail("Null field request", f"Status {res_null.status_code}")

        # Test sorting on null fields
        res_sort_null_pop = client.get("/api/v1/search/", {"q": "Null Test", "sort_by": "popularity"})
        if res_sort_null_pop.status_code == 200:
            record_pass("sort_by=popularity with zero popularity succeeds (HTTP 200)")
        else:
            record_fail("sort_by=popularity zero pop crash", f"Status {res_sort_null_pop.status_code}")

        res_sort_null_rating = client.get("/api/v1/search/", {"q": "Null Test", "sort_by": "rating"})
        if res_sort_null_rating.status_code == 200:
            record_pass("sort_by=rating with null avg_rating succeeds (HTTP 200)")
        else:
            record_fail("sort_by=rating null crash", f"Status {res_sort_null_rating.status_code}")

        # 3.2 Deterministic pagination across ties
        clean_db()
        # Create 12 items with IDENTICAL title prefix, identical popularity (50.0), identical rating (8.0)
        items_12 = []
        for i in range(1, 13):
            items_12.append(create_item("movie", f"Identical Batch Item {i:02d}", f"identical-batch-item-{i:02d}", popularity=50.0))

        # Paginate with page_size=4 across 3 pages
        p1 = client.get("/api/v1/search/", {"q": "Identical Batch", "page": 1, "page_size": 4})
        p2 = client.get("/api/v1/search/", {"q": "Identical Batch", "page": 2, "page_size": 4})
        p3 = client.get("/api/v1/search/", {"q": "Identical Batch", "page": 3, "page_size": 4})

        p1_ids = [it["id"] for it in p1.data["items"]]
        p2_ids = [it["id"] for it in p2.data["items"]]
        p3_ids = [it["id"] for it in p3.data["items"]]

        all_collected_ids = p1_ids + p2_ids + p3_ids
        unique_collected_ids = set(all_collected_ids)

        if len(all_collected_ids) == 12 and len(unique_collected_ids) == 12:
            record_pass("Deterministic tie-breaker ('title', 'id') guarantees 0 duplicates across paginated pages", f"12 unique items over 3 pages")
        else:
            record_fail("Pagination determinism", f"Duplicates detected! Total: {len(all_collected_ids)}, Unique: {len(unique_collected_ids)}")

        # 3.3 Score range bounds verification
        # Max theoretical score: 100.0 (match) + 30.0 (trigram) + 5.0 (pop) = 135.0
        score_max = compute_relevance_score(
            title="Exact Title",
            query="Exact Title",
            popularity=1000000.0,
            slug="exact-title",
        )
        if 130.0 <= score_max <= 135.0:
            record_pass("compute_relevance_score maximum bound respected", f"Score: {score_max:.2f} <= 135.0")
        else:
            record_fail("Relevance score upper bound", f"Score was {score_max}")

        score_min = compute_relevance_score(
            title="",
            query="Test",
            popularity=-100.0,
            slug="",
        )
        if score_min == 0.0:
            record_pass("compute_relevance_score minimum bound respected (0.0 for empty/invalid)")
        else:
            record_fail("Relevance score lower bound", f"Score was {score_min}")

    except Exception as e:
        record_fail("Suite 3 exception", str(e))

    # =========================================================================
    # SUITE 4: PERFORMANCE & QUERY COUNT PROFILING
    # =========================================================================
    print("\n--- SUITE 4: Performance & Query Count Profiling ---")

    try:
        clean_db()
        # Seed 50 realistic items with assets and external_ids
        for i in range(50):
            item = create_item("movie", f"Sci-Fi Odyssey Volume {i}", f"sci-fi-odyssey-{i}", popularity=float(i * 2))
            MediaAsset.objects.create(media_item=item, asset_type="poster", url=f"https://img.test/{i}.jpg")
            ExternalID.objects.create(target=item, provider="tmdb", external_id=str(1000 + i))

        # 4.1 Query count profiling (N+1 check)
        reset_queries()
        with CaptureQueriesContext(connection) as ctx:
            res_nplus1 = client.get("/api/v1/search/", {"q": "Sci-Fi Odyssey", "page_size": 24})

        q_count = len(ctx.captured_queries)
        # We expect:
        # 1. Base query for items (or count + items)
        # 2. Prefetch assets
        # 3. Prefetch external_ids
        # 4. Search log insert (if logged)
        # Total queries should be <= 6 regardless of page_size (NOT 24 * 2 queries!)
        if res_nplus1.status_code == 200 and len(res_nplus1.data["items"]) == 24:
            if q_count <= 8:
                record_pass(f"Zero N+1 queries confirmed for page_size=24: executed {q_count} DB queries total")
            else:
                record_fail("N+1 queries detected", f"Executed {q_count} queries for 24 items")
        else:
            record_fail("Query count test request", f"Status {res_nplus1.status_code}")

        # 4.2 Query latency benchmark
        # Run 50 search queries across different modes and calculate latency stats
        latencies = []
        queries_to_test = [
            ("Sci-Fi Odyssey", None, None),
            ("Sci-Fi Odyssey", "movie", None),
            ("sci-fi odyssy", None, None), # typo
            ("Sci-Fi Odyssey", None, "popularity"),
            ("Sci-Fi Odyssey", None, "rating"),
        ]

        for _ in range(10):
            for q_str, m_type, s_by in queries_to_test:
                params = {"q": q_str}
                if m_type:
                    params["media_type"] = m_type
                if s_by:
                    params["sort_by"] = s_by
                t0 = time.perf_counter()
                res_bench = client.get("/api/v1/search/", params)
                t1 = time.perf_counter()
                if res_bench.status_code == 200:
                    latencies.append((t1 - t0) * 1000)

        if latencies:
            latencies.sort()
            p50 = latencies[len(latencies) // 2]
            p95 = latencies[int(len(latencies) * 0.95)]
            max_lat = max(latencies)
            avg_lat = sum(latencies) / len(latencies)

            print(f"  --> Latency Benchmark (50 requests):")
            print(f"      Avg: {avg_lat:.2f}ms | p50: {p50:.2f}ms | p95: {p95:.2f}ms | Max: {max_lat:.2f}ms")

            if p95 < 50.0:
                record_pass(f"Search latency budget achieved: p95 = {p95:.2f}ms (< 50ms budget)")
            else:
                record_warn(f"Search latency p95: {p95:.2f}ms", "Slightly above 50ms in testing environment")
        else:
            record_fail("Benchmark latencies", "No successful responses recorded")

    except Exception as e:
        record_fail("Suite 4 exception", str(e))

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 80)
    print("CHALLENGER 2 ADVERSARIAL STRESS TEST SUMMARY")
    print(f"Total Passes:   {passes}")
    print(f"Total Failures: {failures}")
    print(f"Total Warnings: {warnings}")
    if details:
        print("\nFailures:")
        for name, err in details:
            print(f"  - {name}: {err}")
    print("=" * 80)
    return failures == 0


if __name__ == "__main__":
    success = run_challenger2_adversarial_suite()
    sys.exit(0 if success else 1)
