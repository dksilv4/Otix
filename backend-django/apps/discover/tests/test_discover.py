"""Endpoint tests for the discover domain (hero + list_type feeds).

Covers the two ported ``/api/v1/discover`` routes: public anonymous reads, the
artwork/logo filters, list-type validation (400), the per-list_type date
windows and sorts, adult exclusion vs. staff visibility, the personalized
list-type fall-through to the generic popularity listing, the empty
``new_season_for_you`` feed, and language/is_anime narrowing. Mirrors the
legacy ``otix/api/discover`` routers (personalization seeding + Redis caching
deferred).
"""

from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaAsset, MediaItem, Movie

User = get_user_model()

SUMMARY_KEYS = {
    "id",
    "media_type",
    "title",
    "slug",
    "poster_url",
    "release_date",
    "popularity",
    "avg_rating",
    "rating_count",
    "user_interactions",
}


def _days(offset: int) -> date:
    return date.today() + timedelta(days=offset)


def _item(
    title: str,
    *,
    media_type: str = "movie",
    popularity: float = 0.0,
    avg_rating: float | None = None,
    release_date: date | None = None,
    is_adult: bool = False,
    original_language: str | None = None,
    assets: tuple[str, ...] = ("logo", "textless_poster", "poster"),
    anime: bool | None = None,
) -> MediaItem:
    item = MediaItem.objects.create(
        media_type=media_type,
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{abs(hash(title)) % 10**6}",
        release_date=release_date,
        popularity=popularity,
        avg_rating=avg_rating,
        is_adult=is_adult,
        original_language=original_language,
    )
    for asset_type in assets:
        MediaAsset.objects.create(
            media_item=item, asset_type=asset_type, url=f"http://img/{item.pk}/{asset_type}.png"
        )
    if anime is not None:
        Movie.objects.create(media_item=item, is_anime=anime, runtime=100)
    return item


def _list_url(media_type: str, list_type: str) -> str:
    return f"/api/v1/discover/{media_type}/{list_type}"


class DiscoverApiTests(TestCase):
    def setUp(self) -> None:
        self.staff = User.objects.create_user(
            username="mod", password="a-strong-pass", is_staff=True
        )
        self.staff_token = Token.objects.create(user=self.staff)
        self.client = APIClient()  # anonymous
        self.staff_client = APIClient()
        self.staff_client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

    # ── /hero ────────────────────────────────────────────────────────
    def test_hero_public_and_limited(self) -> None:
        _item("Alpha", popularity=90)
        _item("Beta", popularity=80)
        _item("Gamma", popularity=70)
        response = self.client.get("/api/v1/discover/hero", {"limit": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data.keys()), {"items", "has_more", "next_cursor"}
        )
        self.assertEqual(response.data["has_more"], False)
        self.assertIsNone(response.data["next_cursor"])
        self.assertEqual(len(response.data["items"]), 2)
        keys = set(response.data["items"][0].keys())
        self.assertLessEqual(SUMMARY_KEYS, keys)

    def test_hero_requires_artwork(self) -> None:
        keep = _item("With-Art", popularity=90, assets=("logo", "textless_poster", "poster"))
        no_art = _item("No-Art", popularity=95, assets=("logo",))
        response = self.client.get("/api/v1/discover/hero", {"limit": 10})
        ids = [item["id"] for item in response.data["items"]]
        self.assertIn(keep.pk, ids)
        self.assertNotIn(no_art.pk, ids)

    def test_hero_excludes_adult_for_anon_but_staff_sees(self) -> None:
        _item("Normal", popularity=10)
        _item("Adult-Pick", popularity=1000, is_adult=True)
        anon = self.client.get("/api/v1/discover/hero", {"limit": 10})
        staff = self.staff_client.get("/api/v1/discover/hero", {"limit": 10})
        anon_ids = [item["title"] for item in anon.data["items"]]
        staff_ids = [item["title"] for item in staff.data["items"]]
        self.assertNotIn("Adult-Pick", anon_ids)
        self.assertIn("Adult-Pick", staff_ids)

    def test_hero_clamps_and_validates_limit(self) -> None:
        _item("One", popularity=1)
        bad = self.client.get("/api/v1/discover/hero", {"limit": "abc"})
        self.assertEqual(bad.status_code, 400)
        clamped = self.client.get("/api/v1/discover/hero", {"limit": 0})
        self.assertEqual(len(clamped.data["items"]), 1)

    # ── validation ───────────────────────────────────────────────────
    def test_list_type_validates_media_type(self) -> None:
        response = self.client.get(_list_url("album", "popular"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Invalid media_type: album"
        )

    def test_list_type_validates_list_type(self) -> None:
        response = self.client.get(_list_url("movie", "sideways"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Invalid list_type: sideways"
        )

    # ── generic catalog feeds ────────────────────────────────────────
    def test_popular_paginated_and_logo_filtered(self) -> None:
        top = _item("Alpha", popularity=90)
        _item("Logo-Less", popularity=95, assets=("textless_poster",))
        response = self.client.get(_list_url("movie", "popular"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data.keys()), {"count", "next", "previous", "results"}
        )
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], top.pk)

    def test_top_rated_sorts_rating_desc(self) -> None:
        high = _item("High-Rating", popularity=1, avg_rating=9.5)
        _item("Low-Rating", popularity=10, avg_rating=5.0)
        response = self.client.get(_list_url("movie", "top_rated"))
        self.assertEqual(response.data["results"][0]["id"], high.pk)

    def test_trending_date_window(self) -> None:
        _item("Recent", popularity=90, release_date=_days(-10))
        _item("Ancient", popularity=80, release_date=_days(-400))
        _item("Far-Future", popularity=70, release_date=_days(400))
        response = self.client.get(_list_url("movie", "trending"))
        titles = [item["title"] for item in response.data["results"]]
        self.assertIn("Recent", titles)
        self.assertNotIn("Ancient", titles)
        self.assertNotIn("Far-Future", titles)

    def test_upcoming_future_only_ascending(self) -> None:
        first = _item("Sooner", popularity=1, release_date=_days(5))
        _item("Later", popularity=99, release_date=_days(400))
        _item("Past", popularity=50, release_date=_days(-10))
        response = self.client.get(_list_url("movie", "upcoming"))
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["Sooner", "Later"])
        self.assertEqual(response.data["results"][0]["id"], first.pk)

    def test_now_playing_recent_window(self) -> None:
        _item("Fresh", popularity=40, release_date=_days(-10))
        _item("Old", popularity=90, release_date=_days(-400))
        response = self.client.get(_list_url("movie", "now_playing"))
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["Fresh"])

    def test_new_season_for_you_is_empty(self) -> None:
        _item("A-Show", media_type="show", popularity=90)
        response = self.client.get(_list_url("show", "new_season_for_you"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_personalized_list_types_fall_back_to_popularity(self) -> None:
        top = _item("Alpha", popularity=90)
        _item("Beta", popularity=10)
        for list_type in ("collaborative", "semantic", "integration_steam", "integration_plex"):
            response = self.client.get(_list_url("movie", list_type))
            self.assertEqual(response.status_code, 200, list_type)
            self.assertEqual(response.data["results"][0]["id"], top.pk, list_type)

    # ── narrowing + adult policy ─────────────────────────────────────
    def test_artwork_requirement_drops_under_language_filter(self) -> None:
        logo_only = _item(
            "En-Only", popularity=90, original_language="en", assets=("logo",)
        )
        narrowed = self.client.get(_list_url("movie", "popular"), {"language": "en-US"})
        plain = self.client.get(_list_url("movie", "popular"))
        self.assertEqual(
            [item["id"] for item in narrowed.data["results"]], [logo_only.pk]
        )
        self.assertNotIn(
            "En-Only", [item["title"] for item in plain.data["results"]]
        )

    def test_is_anime_filter(self) -> None:
        _item("Shonen", popularity=90, original_language="ja", anime=True)
        _item("Live", popularity=80, original_language="en", anime=False)
        response = self.client.get(
            _list_url("movie", "popular"), {"is_anime": "true"}
        )
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["Shonen"])

    def test_feed_excludes_adult_for_anon_but_staff_sees(self) -> None:
        _item("Family", popularity=1)
        adult = _item("Mature", popularity=500, is_adult=True)
        anon = self.client.get(_list_url("movie", "popular"))
        staff = self.staff_client.get(_list_url("movie", "popular"))
        anon_ids = [item["id"] for item in anon.data["results"]]
        staff_ids = [item["id"] for item in staff.data["results"]]
        self.assertNotIn(adult.pk, anon_ids)
        self.assertIn(adult.pk, staff_ids)

    def test_music_poster_counts_as_artwork(self) -> None:
        _item(
            "An-Album",
            media_type="music",
            popularity=50,
            assets=("logo", "poster"),
        )
        response = self.client.get(_list_url("music", "popular"))
        titles = [item["title"] for item in response.data["results"]]
        self.assertEqual(titles, ["An-Album"])

    # ── /sections ────────────────────────────────────────────────────
    SECTION_KEYS = {
        "id",
        "title",
        "media_type",
        "list_type",
        "genre",
        "language",
        "is_anime",
        "is_personalized",
        "reason",
    }

    def test_sections_public_and_canonical(self) -> None:
        response = self.client.get("/api/v1/discover/sections")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"sections"})
        sections = response.data["sections"]
        self.assertEqual(len(sections), 4)
        self.assertEqual(
            {s["id"] for s in sections},
            {"trending_movies", "trending_shows", "popular_games", "new_music"},
        )
        for section in sections:
            self.assertLessEqual(self.SECTION_KEYS, set(section.keys()))
            self.assertIn(section["media_type"], {"movie", "show", "game", "music"})
            self.assertIn(section["list_type"], {"trending", "popular"})
            self.assertIs(section["is_personalized"], False)

    def test_sections_default_for_authed_user_too(self) -> None:
        # Per-user generate_sections/compute_profile is deferred; an authed
        # caller still receives the canonical defaults (no crash).
        response = self.staff_client.get("/api/v1/discover/sections")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [s["id"] for s in response.data["sections"]],
            ["trending_movies", "trending_shows", "popular_games", "new_music"],
        )
