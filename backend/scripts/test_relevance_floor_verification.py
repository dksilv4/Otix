"""Adversarial verification script for Milestone 1 candidate noise reduction and sorting relevance floor."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

import django
django.setup()

from apps.media.models import MediaItem
from apps.search.services import search_media_payload
from apps.search.services.search import py_trigram_similarity, py_word_trigram_similarity


def main():
    print("=" * 80)
    print("CHALLENGER 1 ADVERSARIAL VERIFICATION: SORTING RELEVANCE FLOOR & NOISE")
    print("=" * 80)

    # 1. Trigram comparison
    print("\n--- 1. Trigram vs Word Trigram Metrics ---")
    comparisons = [
        ("spidrman", "Spider-Man"),
        ("inceptoin", "Inception"),
        ("matrxi", "The Matrix"),
        ("Batman", "Batman: Arkham Knight"),
        ("Batman", "Mega Man Battle Network 3 White"),
        ("Batman", "Hitman: Blood Money"),
        ("Batman", "Beatmania"),
        ("Inception", "Uncharted 3: Drake's Deception"),
        ("Spider-Man", "Fate/Grand Order: Spiral Proof World - Lilim Harlot"),
    ]
    for q, t in comparisons:
        trig = py_trigram_similarity(q, t)
        wtrig = py_word_trigram_similarity(q, t)
        print(f"Query: {q:12} | Title: {t:48} | trig: {trig:.4f} | wtrig: {wtrig:.4f}")

    # 2. Live query for Batman with sort_by=popularity
    print("\n--- 2. Live Query: 'Batman' with sort_by=popularity (page_size=10) ---")
    res = search_media_payload("Batman", sort_by="popularity", page_size=10)
    print(f"Total returned: {res.get('total')}")
    batman_top = res.get("items", [])
    unrelated_count = 0
    for idx, it in enumerate(batman_top, 1):
        title = it.get("title", "")
        pop = it.get("popularity", 0.0)
        is_batman = "batman" in title.lower()
        tag = "[GENUINE]" if is_batman else "[UNRELATED NOISE]"
        if not is_batman:
            unrelated_count += 1
        print(f"  #{idx:2d} {tag:18} {title:40} (pop: {pop})")

    # 3. Displaced Batman titles
    print("\n--- 3. Legitimate Batman Titles Displaced from Top Results ---")
    displaced = MediaItem.objects.filter(title__icontains="Batman").order_by("-popularity")[:15]
    for it in displaced:
        in_top_10 = any(x["id"] == it.id for x in batman_top)
        status = "IN TOP 10" if in_top_10 else "DISPLACED"
        print(f"  [{status:9}] {it.title:40} (pop: {it.popularity})")

    # 4. Other queries with sort_by=popularity
    print("\n--- 4. Other Queries with sort_by=popularity ---")
    for q in ["Inception", "Spider-Man", "Matrix"]:
        res_q = search_media_payload(q, sort_by="popularity", page_size=5)
        print(f"\nQuery: '{q}' (Total: {res_q.get('total')})")
        for idx, it in enumerate(res_q.get("items", []), 1):
            title = it.get("title", "")
            pop = it.get("popularity", 0.0)
            print(f"  #{idx} {title:45} (pop: {pop})")


if __name__ == "__main__":
    main()
