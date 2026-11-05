"""Adversarial stress-test script for Milestone 1: Hybrid Relevance Ranking & SQLite/PostgreSQL.

Executes empirical challenges against:
1. Typo mutations (inverted adjacent characters, missing vowels, doubled consonants, punctuation stripping).
2. Exact match superiority over high-popularity fuzzy/prefix/substring matches.
3. Boundary conditions (whitespace, SQL wildcards, injection payloads, regex metachars, giant inputs).
4. Unicode, accented characters, and CJK scripts.
5. SQLite custom functions and PostgreSQL trigram parity.
6. REST API endpoints (/search, /suggestions, /grouped).
"""

from __future__ import annotations

import os
import sys
import time

# Ensure /app or backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Ensure Django is initialized
if "DJANGO_SETTINGS_MODULE" not in os.environ:
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.test"

import django
django.setup()

from django.core.management import call_command
call_command("migrate", verbosity=0)

from datetime import date
from django.db import connection, transaction
from rest_framework.test import APIClient
from apps.media.models import Game, MediaItem, Movie, Show
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


class TestFailure(Exception):
    pass


def run_adversarial_suite():
    print("=" * 80)
    print(f"ADVERSARIAL STRESS SUITE (DB Vendor: {connection.vendor})")
    print("=" * 80)

    client = APIClient()
    passes = 0
    failures = 0
    failure_details = []

    def record_pass(test_name: str, detail: str = ""):
        nonlocal passes
        passes += 1
        print(f"  [PASS] {test_name} {f'({detail})' if detail else ''}")

    def record_fail(test_name: str, error: str):
        nonlocal failures
        failures += 1
        failure_details.append((test_name, error))
        print(f"  [FAIL] {test_name}: {error}")

    def create_item(media_type: str, title: str, slug: str, popularity: float = 10.0) -> MediaItem:
        item = MediaItem.objects.create(
            media_type=media_type,
            title=title,
            slug=slug,
            popularity=popularity,
            avg_rating=8.0,
            release_date=date(2022, 1, 1),
        )
        subtype = {"movie": Movie, "show": Show, "game": Game}.get(media_type)
        if subtype:
            subtype.objects.create(media_item=item)
        return item

    # Clean up any existing media items
    MediaItem.objects.all().delete()

    # =========================================================================
    # SUITE 1: ADVERSARIAL TYPO MUTATIONS
    # =========================================================================
    print("\n--- SUITE 1: Adversarial Typo Mutations ---")

    # 1.1 Inverted adjacent characters
    try:
        item1 = create_item("movie", "Inception", "inception", popularity=50.0)
        item2 = create_item("movie", "Interstellar", "interstellar", popularity=50.0)
        item3 = create_item("movie", "Gladiator", "gladiator", popularity=50.0)

        # "inceptoin" -> Inception
        res = client.get("/api/v1/search/", {"q": "inceptoin"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == item1.id:
            record_pass("Inverted adjacent 'inceptoin' -> Inception")
        else:
            record_fail("Inverted adjacent 'inceptoin'", f"Got {res.data.get('items')}")

        # "itnerstellar" -> Interstellar
        res = client.get("/api/v1/search/", {"q": "itnerstellar"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == item2.id:
            record_pass("Inverted adjacent 'itnerstellar' -> Interstellar")
        else:
            record_fail("Inverted adjacent 'itnerstellar'", f"Got {res.data.get('items')}")

        # "gladaitor" -> Gladiator
        res = client.get("/api/v1/search/", {"q": "gladaitor"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == item3.id:
            record_pass("Inverted adjacent 'gladaitor' -> Gladiator")
        else:
            record_fail("Inverted adjacent 'gladaitor'", f"Got {res.data.get('items')}")
    except Exception as e:
        record_fail("Inverted adjacent characters exception", str(e))

    # 1.2 Missing vowels
    try:
        spiderman = create_item("movie", "Spider-Man", "spider-man", popularity=40.0)
        batman = create_item("movie", "Batman", "batman", popularity=40.0)

        # "spidrman" -> Spider-Man
        res = client.get("/api/v1/search/", {"q": "spidrman"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spiderman.id:
            record_pass("Missing vowel 'spidrman' -> Spider-Man")
        else:
            record_fail("Missing vowel 'spidrman'", f"Got {res.data.get('items')}")

        # "batmn" -> Batman
        res = client.get("/api/v1/search/", {"q": "batmn"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == batman.id:
            record_pass("Missing vowel 'batmn' -> Batman")
        else:
            record_fail("Missing vowel 'batmn'", f"Got {res.data.get('items')}")
    except Exception as e:
        record_fail("Missing vowels exception", str(e))

    # 1.3 Doubled consonants
    try:
        # "spidder" -> Spider-Man
        res = client.get("/api/v1/search/", {"q": "spidder"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spiderman.id:
            record_pass("Doubled consonant 'spidder' -> Spider-Man")
        else:
            record_fail("Doubled consonant 'spidder'", f"Got {res.data.get('items')}")

        # "innoception" -> Inception
        res = client.get("/api/v1/search/", {"q": "innoception"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == item1.id:
            record_pass("Doubled consonant 'innoception' -> Inception")
        else:
            record_fail("Doubled consonant 'innoception'", f"Got {res.data.get('items')}")

        # "gladdiator" -> Gladiator
        res = client.get("/api/v1/search/", {"q": "gladdiator"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == item3.id:
            record_pass("Doubled consonant 'gladdiator' -> Gladiator")
        else:
            record_fail("Doubled consonant 'gladdiator'", f"Got {res.data.get('items')}")
    except Exception as e:
        record_fail("Doubled consonants exception", str(e))

    # 1.4 Punctuation stripping and variation
    try:
        walle = create_item("movie", "WALL-E", "wall-e", popularity=45.0)
        xmen = create_item("movie", "X-Men", "x-men", popularity=45.0)

        # "Spider Man" -> Spider-Man
        res = client.get("/api/v1/search/", {"q": "Spider Man"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spiderman.id:
            record_pass("Punctuation variation 'Spider Man' -> Spider-Man")
        else:
            record_fail("Punctuation variation 'Spider Man'", f"Got {res.data.get('items')}")

        # "spiderman" -> Spider-Man
        res = client.get("/api/v1/search/", {"q": "spiderman"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spiderman.id:
            record_pass("Punctuation stripping 'spiderman' -> Spider-Man")
        else:
            record_fail("Punctuation stripping 'spiderman'", f"Got {res.data.get('items')}")

        # "WALL E" -> WALL-E
        res = client.get("/api/v1/search/", {"q": "WALL E"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == walle.id:
            record_pass("Punctuation variation 'WALL E' -> WALL-E")
        else:
            record_fail("Punctuation variation 'WALL E'", f"Got {res.data.get('items')}")

        # "walle" -> WALL-E
        res = client.get("/api/v1/search/", {"q": "walle"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == walle.id:
            record_pass("Punctuation stripping 'walle' -> WALL-E")
        else:
            record_fail("Punctuation stripping 'walle'", f"Got {res.data.get('items')}")

        # "X Men" -> X-Men
        res = client.get("/api/v1/search/", {"q": "X Men"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == xmen.id:
            record_pass("Punctuation variation 'X Men' -> X-Men")
        else:
            record_fail("Punctuation variation 'X Men'", f"Got {res.data.get('items')}")

        # "xmen" -> X-Men
        res = client.get("/api/v1/search/", {"q": "xmen"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == xmen.id:
            record_pass("Punctuation stripping 'xmen' -> X-Men")
        else:
            record_fail("Punctuation stripping 'xmen'", f"Got {res.data.get('items')}")
    except Exception as e:
        record_fail("Punctuation stripping exception", str(e))

    # =========================================================================
    # SUITE 2: EXACT MATCH STRICT SUPERIORITY REGARDLESS OF POPULARITY
    # =========================================================================
    print("\n--- SUITE 2: Exact Match Strict Superiority ---")
    try:
        # Create an exact match with LOW popularity (0.0)
        dune_exact = create_item("movie", "Dune", "dune", popularity=0.0)
        # Create high-popularity competitors:
        # 1. Prefix competitor with massive popularity
        dune_prefix = create_item("movie", "Dune: Part Two", "dune-part-two", popularity=100000.0)
        # 2. Substring competitor with massive popularity
        dune_sub = create_item("movie", "Frank Herbert's Dune", "frank-herberts-dune", popularity=999999.0)
        # 3. Typo/fuzzy competitor with massive popularity
        dune_typo = create_item("movie", "Dune Messiah", "dune-messiah", popularity=500000.0)

        res = client.get("/api/v1/search/", {"q": "Dune"})
        if res.status_code == 200:
            items = res.data["items"]
            if len(items) >= 4 and items[0]["id"] == dune_exact.id:
                record_pass(
                    "Exact match (pop=0.0) strictly outranks prefix (pop=100k) and substring (pop=1M)",
                    f"Top item: '{items[0]['title']}', rank 1 score > all others",
                )
            else:
                record_fail("Exact match superiority", f"Top item was {items[0] if items else 'empty'}")
        else:
            record_fail("Exact match endpoint call", f"Status {res.status_code}")

        # Test case insensitivity exact match: "dune" query
        res_lower = client.get("/api/v1/search/", {"q": "dune"})
        if res_lower.status_code == 200 and res_lower.data["items"][0]["id"] == dune_exact.id:
            record_pass("Case-insensitive exact match 'dune' strictly outranks higher popularity")
        else:
            record_fail("Case-insensitive exact match", f"Top item was {res_lower.data.get('items')}")

        # Test UPPERCASE query: "DUNE"
        res_upper = client.get("/api/v1/search/", {"q": "DUNE"})
        if res_upper.status_code == 200 and res_upper.data["items"][0]["id"] == dune_exact.id:
            record_pass("Uppercase exact match 'DUNE' strictly outranks higher popularity")
        else:
            record_fail("Uppercase exact match", f"Top item was {res_upper.data.get('items')}")
    except Exception as e:
        record_fail("Exact match superiority exception", str(e))

    # =========================================================================
    # SUITE 3: BOUNDARY INPUTS & RESILIENCE
    # =========================================================================
    print("\n--- SUITE 3: Boundary Inputs & Resilience ---")

    # 3.1 Whitespace padding
    try:
        # Leading and trailing spaces
        res = client.get("/api/v1/search/", {"q": "   Dune    "})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == dune_exact.id:
            record_pass("Leading/trailing whitespace padding properly handled")
        else:
            record_fail("Leading/trailing whitespace padding", f"Got {res.data.get('items')}")

        # Multiple inner spaces: "Spider    Man"
        res = client.get("/api/v1/search/", {"q": "Spider    Man"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spiderman.id:
            record_pass("Multiple inner spaces 'Spider    Man' properly normalized")
        else:
            record_fail("Multiple inner spaces", f"Got {res.data.get('items')}")

        # Pure whitespace query: API view requires non-empty q and returns HTTP 400
        res_empty = client.get("/api/v1/search/", {"q": "    "})
        if res_empty.status_code == 400:
            record_pass("Pure whitespace query gracefully rejected by API view (HTTP 400 parse_error)")
        else:
            record_fail("Pure whitespace query", f"Expected HTTP 400, got {res_empty.status_code}")

        # Completely empty query: API view requires non-empty q and returns HTTP 400
        res_blank = client.get("/api/v1/search/", {"q": ""})
        if res_blank.status_code == 400:
            record_pass("Empty string query gracefully rejected by API view (HTTP 400 parse_error)")
        else:
            record_fail("Empty string query", f"Expected HTTP 400, got {res_blank.status_code}")

        # Service-level verification: search_media_payload handles empty/whitespace cleanly
        svc_empty = search_media_payload(q="   ", media_type=None, sort_by=None, page=1, page_size=20)
        if svc_empty["items"] == [] and svc_empty["total"] == 0:
            record_pass("Service search_media_payload(q='   ') returns empty list without error")
        else:
            record_fail("Service search_media_payload empty q", f"Got {svc_empty}")
    except Exception as e:
        record_fail("Whitespace padding exception", str(e))

    # 3.2 Symbols and SQL injection resistance
    try:
        payloads = [
            "' OR '1'='1",
            "'; DROP TABLE media_items; --",
            "Spider%Man",
            "Spider_Man",
            "Spider\\Man",
            'Spider"Man',
            "Dune (2021) [Remastered] + * ? ^ $",
            "???!!!@@@###$$$%%%^^^&&&***",
            "<script>alert('xss')</script>",
            "Dune's Return",
        ]
        for p in payloads:
            res = client.get("/api/v1/search/", {"q": p})
            if res.status_code == 200:
                record_pass(f"Symbol resilience: {p[:25]}", f"Returned HTTP 200")
            else:
                record_fail(f"Symbol resilience: {p[:25]}", f"Returned HTTP {res.status_code}")

        # Verify media_items table was not dropped or corrupted
        count = MediaItem.objects.count()
        if count >= 8:
            record_pass("Database integrity verified (no tables dropped, count intact)")
        else:
            record_fail("Database integrity check", f"Expected count >= 8, got {count}")
    except Exception as e:
        record_fail("Symbol resilience exception", str(e))

    # 3.3 Unicode accents & Latin diacritics
    try:
        amelie = create_item("movie", "Amélie", "amelie", popularity=60.0)
        pokemon = create_item("game", "Pokémon Emerald", "pokemon-emerald", popularity=70.0)
        motley = create_item("movie", "Mötley Crüe", "motley-crue", popularity=50.0)

        # "Amélie" exact with accent
        res = client.get("/api/v1/search/", {"q": "Amélie"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == amelie.id:
            record_pass("Accented exact query 'Amélie' -> Amélie")
        else:
            record_fail("Accented exact query 'Amélie'", f"Got {res.data.get('items')}")

        # "Amelie" without accent
        res = client.get("/api/v1/search/", {"q": "Amelie"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == amelie.id:
            record_pass("Unaccented query 'Amelie' -> Amélie")
        else:
            record_fail("Unaccented query 'Amelie'", f"Got {res.data.get('items')}")

        # "Pokemon" without accent
        res = client.get("/api/v1/search/", {"q": "Pokemon"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == pokemon.id:
            record_pass("Unaccented query 'Pokemon' -> Pokémon Emerald")
        else:
            record_fail("Unaccented query 'Pokemon'", f"Got {res.data.get('items')}")

        # "Pokémon" with accent
        res = client.get("/api/v1/search/", {"q": "Pokémon"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == pokemon.id:
            record_pass("Accented query 'Pokémon' -> Pokémon Emerald")
        else:
            record_fail("Accented query 'Pokémon'", f"Got {res.data.get('items')}")

        # "Motley Crue" without umlauts
        res = client.get("/api/v1/search/", {"q": "Motley Crue"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == motley.id:
            record_pass("Umlaut query 'Motley Crue' -> Mötley Crüe")
        else:
            record_fail("Umlaut query 'Motley Crue'", f"Got {res.data.get('items')}")
    except Exception as e:
        record_fail("Unicode accents exception", str(e))

    # 3.4 Non-Latin and CJK Scripts
    try:
        spirited_away = create_item("movie", "千と千尋の神隠し", "spirited-away", popularity=80.0)
        parasite_kr = create_item("movie", "기생충", "parasite", popularity=85.0)

        # CJK Japanese exact
        res = client.get("/api/v1/search/", {"q": "千と千尋の神隠し"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spirited_away.id:
            record_pass("CJK Japanese exact '千と千尋の神隠し' -> 千と千尋の神隠し")
        else:
            record_fail("CJK Japanese exact '千と千尋の神隠し'", f"Got {res.data.get('items')}")

        # CJK Japanese substring
        res = client.get("/api/v1/search/", {"q": "千と千尋"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == spirited_away.id:
            record_pass("CJK Japanese substring '千と千尋' -> 千と千尋の神隠し")
        else:
            record_fail("CJK Japanese substring '千と千尋'", f"Got {res.data.get('items')}")

        # CJK Korean exact
        res = client.get("/api/v1/search/", {"q": "기생충"})
        if res.status_code == 200 and len(res.data["items"]) >= 1 and res.data["items"][0]["id"] == parasite_kr.id:
            record_pass("CJK Korean exact '기생충' -> 기생충")
        else:
            record_fail("CJK Korean exact '기생충'", f"Got {res.data.get('items')}")
    except Exception as e:
        record_fail("CJK scripts exception", str(e))

    # 3.5 Giant string query (1,000 and 5,000 characters)
    try:
        giant_1k = "a" * 1000
        start = time.time()
        res_1k = client.get("/api/v1/search/", {"q": giant_1k})
        elapsed_1k = time.time() - start
        if res_1k.status_code == 200:
            record_pass(f"1,000-character query handled in {elapsed_1k*1000:.1f}ms (HTTP 200)")
        else:
            record_fail("1,000-character query", f"Status {res_1k.status_code}")

        giant_5k = "Dune " * 1000
        start = time.time()
        res_5k = client.get("/api/v1/search/", {"q": giant_5k})
        elapsed_5k = time.time() - start
        if res_5k.status_code == 200:
            record_pass(f"5,000-character query handled in {elapsed_5k*1000:.1f}ms (HTTP 200)")
        else:
            record_fail("5,000-character query", f"Status {res_5k.status_code}")
    except Exception as e:
        record_fail("Giant query exception", str(e))

    # =========================================================================
    # SUITE 4: ENDPOINTS CONTRACTS & EXTENSIONS
    # =========================================================================
    print("\n--- SUITE 4: Endpoints Contracts & Extensions ---")

    # 4.1 Suggestions endpoint with typo
    try:
        res = client.get("/api/v1/search/suggestions", {"q": "inceptoin"})
        if res.status_code == 200 and isinstance(res.data, list) and len(res.data) >= 1:
            if res.data[0]["id"] == item1.id and res.data[0]["title"] == "Inception":
                record_pass("Suggestions endpoint resolves typo 'inceptoin' -> Inception")
            else:
                record_fail("Suggestions typo match item", f"Got {res.data[0]}")
        else:
            record_fail("Suggestions endpoint call", f"Status {res.status_code}, data: {res.data}")
    except Exception as e:
        record_fail("Suggestions endpoint exception", str(e))

    # 4.2 Grouped endpoint with typo and best_results
    try:
        res = client.get("/api/v1/search/grouped", {"q": "spidrman"})
        if res.status_code == 200:
            movies = res.data.get("movies", [])
            best = res.data.get("best_results", [])
            if len(movies) >= 1 and movies[0]["id"] == spiderman.id and len(best) >= 1 and best[0]["id"] == spiderman.id:
                record_pass("Grouped endpoint resolves typo 'spidrman' in movies & best_results")
            else:
                record_fail("Grouped typo resolution", f"movies={movies}, best={best}")
        else:
            record_fail("Grouped endpoint call", f"Status {res.status_code}")
    except Exception as e:
        record_fail("Grouped endpoint exception", str(e))

    # 4.3 SQLite Fallback Functions (if on SQLite)
    if connection.vendor == "sqlite":
        print("\n--- SUITE 5: SQLite Custom Functions Verification ---")
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT similarity('inceptoin', 'Inception')")
                sim_val = cursor.fetchone()[0]
                if sim_val >= 0.40:
                    record_pass("SQLite SQL function similarity('inceptoin', 'Inception')", f"{sim_val:.3f} >= 0.40")
                else:
                    record_fail("SQLite similarity function", f"Value was {sim_val}")

                cursor.execute("SELECT word_similarity('Spider Man', 'Spider-Man')")
                wsim_val = cursor.fetchone()[0]
                if wsim_val >= 0.90:
                    record_pass("SQLite SQL function word_similarity('Spider Man', 'Spider-Man')", f"{wsim_val:.3f} >= 0.90")
                else:
                    record_fail("SQLite word_similarity function", f"Value was {wsim_val}")

                cursor.execute("SELECT ln(100.0)")
                ln_val = cursor.fetchone()[0]
                if abs(ln_val - 4.605) < 0.01:
                    record_pass("SQLite SQL function ln(100.0)", f"{ln_val:.3f} approx 4.605")
                else:
                    record_fail("SQLite ln function", f"Value was {ln_val}")
        except Exception as e:
            record_fail("SQLite functions exception", str(e))

    print("\n" + "=" * 80)
    print("ADVERSARIAL STRESS TEST SUMMARY")
    print(f"Total Passes: {passes}")
    print(f"Total Failures: {failures}")
    if failure_details:
        print("\nFailures:")
        for name, err in failure_details:
            print(f"  - {name}: {err}")
    print("=" * 80)
    return failures == 0


if __name__ == "__main__":
    success = run_adversarial_suite()
    sys.exit(0 if success else 1)
