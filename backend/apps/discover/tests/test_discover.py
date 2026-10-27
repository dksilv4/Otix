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

from apps.media.models import (
    Episode,
    Game,
    Genre,
    MediaAsset,
    MediaGenre,
    MediaItem,
    Movie,
    Season,
    Show,
)

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
    game_type: str = "main_game",
    rating_count: int = 0,
) -> MediaItem:
    item = MediaItem.objects.create(
        media_type=media_type,
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{abs(hash(title)) % 10**6}",
        release_date=release_date,
        popularity=popularity,
        avg_rating=avg_rating,
        rating_count=rating_count,
        is_adult=is_adult,
        original_language=original_language,
    )
    for asset_type in assets:
        MediaAsset.objects.create(
            media_item=item, asset_type=asset_type, url=f"http://img/{item.pk}/{asset_type}.png"
        )
    if anime is not None:
        Movie.objects.create(media_item=item, is_anime=anime, runtime=100)
    if media_type == "game":
        # Curated game rails join the subtype to keep DLC/expansions out, so
        # game fixtures need a Game row (default main_game).
        Game.objects.create(media_item=item, game_type=game_type)
    return item


def _mirror(item: MediaItem, asset_type: str = "textless_poster") -> None:
    MediaAsset.objects.filter(media_item=item, asset_type=asset_type).update(
        local_name=f"{item.pk}-{asset_type}.png"
    )


def _list_url(media_type: str, list_type: str) -> str:
    return f"/api/v1/discover/{media_type}/{list_type}"


class DiscoverApiTests(TestCase):
    def setUp(self) -> None:
        from django.core.cache import cache
        cache.clear()
        self.staff = User.objects.create_user(
            username="mod", password="a-strong-pass", is_staff=True
        )
        self.staff_token = Token.objects.create(user=self.staff)
        self.client = APIClient()  # anonymous
        self.staff_client = APIClient()
        self.staff_client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

    def tearDown(self) -> None:
        from django.core.cache import cache
        cache.clear()

    # ── /hero ────────────────────────────────────────────────────────
    def test_hero_public_and_limited(self) -> None:
        _item("Alpha", popularity=90)
        _item("Beta", popularity=80)
        _item("Gamma", popularity=70)
        response = self.client.get("/api/v1/discover/hero", {"limit": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"items", "has_more", "next_cursor"})
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

    def test_hero_prefers_locally_mirrored_artwork(self) -> None:
        _item("Remote-Hit", popularity=100)
        local = _item("Local-Copy", popularity=1)
        _mirror(local)
        titles = [
            item["title"]
            for item in self.client.get("/api/v1/discover/hero", {"limit": 2}).data["items"]
        ]
        self.assertEqual(titles[0], "Local-Copy")
        self.assertIn("Remote-Hit", titles)

    # ── validation ───────────────────────────────────────────────────
    def test_list_type_validates_media_type(self) -> None:
        response = self.client.get(_list_url("album", "popular"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Invalid media_type: album")

    def test_list_type_validates_list_type(self) -> None:
        response = self.client.get(_list_url("movie", "sideways"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Invalid list_type: sideways")

    # ── generic catalog feeds ────────────────────────────────────────
    def test_popular_paginated_and_logo_filtered(self) -> None:
        top = _item("Alpha", popularity=90)
        _item("Logo-Less", popularity=95, assets=("textless_poster",))
        response = self.client.get(_list_url("movie", "popular"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"items", "has_more", "next_cursor"})
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["has_more"], False)
        self.assertIsNone(response.data["next_cursor"])
        self.assertEqual(response.data["items"][0]["id"], top.pk)

    def test_popular_cursor_pagination(self) -> None:
        first = _item("Alpha", popularity=90)
        second = _item("Beta", popularity=80)
        third = _item("Gamma", popularity=70)
        page1 = self.client.get(_list_url("movie", "popular"), {"limit": 2})
        self.assertEqual(page1.status_code, 200)
        self.assertEqual(len(page1.data["items"]), 2)
        self.assertTrue(page1.data["has_more"])
        self.assertEqual(page1.data["next_cursor"], "2")
        self.assertEqual([item["id"] for item in page1.data["items"]], [first.pk, second.pk])

        page2 = self.client.get(_list_url("movie", "popular"), {"limit": 2, "cursor": "2"})
        self.assertEqual(page2.status_code, 200)
        self.assertEqual(len(page2.data["items"]), 1)
        self.assertFalse(page2.data["has_more"])
        self.assertIsNone(page2.data["next_cursor"])
        self.assertEqual(page2.data["items"][0]["id"], third.pk)

    def test_popular_prefers_locally_mirrored_artwork(self) -> None:
        _item("Remote-Popular", popularity=90)
        local = _item("Local-Quiet", popularity=1)
        _mirror(local)
        titles = [
            item["title"] for item in self.client.get(_list_url("movie", "popular")).data["items"]
        ]
        self.assertEqual(titles[0], "Local-Quiet")
        self.assertIn("Remote-Popular", titles)

    def test_top_rated_sorts_rating_desc(self) -> None:
        high = _item("High-Rating", popularity=1, avg_rating=9.5)
        _item("Low-Rating", popularity=10, avg_rating=5.0)
        response = self.client.get(_list_url("movie", "top_rated"))
        self.assertEqual(response.data["items"][0]["id"], high.pk)

    def test_trending_date_window(self) -> None:
        _item("Recent", popularity=90, release_date=_days(-10))
        _item("Ancient", popularity=80, release_date=_days(-400))
        _item("Far-Future", popularity=70, release_date=_days(400))
        response = self.client.get(_list_url("movie", "trending"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Recent", titles)
        self.assertNotIn("Ancient", titles)
        self.assertNotIn("Far-Future", titles)

    def test_upcoming_future_only_ascending(self) -> None:
        first = _item("Sooner", popularity=1, release_date=_days(5))
        _item("Later", popularity=99, release_date=_days(400))
        _item("Past", popularity=50, release_date=_days(-10))
        response = self.client.get(_list_url("movie", "upcoming"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Sooner", "Later"])
        self.assertEqual(response.data["items"][0]["id"], first.pk)

    def test_now_playing_recent_window(self) -> None:
        _item("Fresh", popularity=40, release_date=_days(-10))
        _item("Old", popularity=90, release_date=_days(-400))
        response = self.client.get(_list_url("movie", "now_playing"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Fresh"])

    def test_upcoming_excludes_today_release(self) -> None:
        # A game whose IGDB release_date is today is out (newly_released), not
        # "coming soon" — IGDB stamps undated titles with today, which would
        # otherwise flood the upcoming rail with just-released rows.
        _item("Today", media_type="game", release_date=_days(0))
        _item("Soon", media_type="game", release_date=_days(3))
        response = self.client.get(_list_url("game", "upcoming"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Soon"])

    def test_game_newly_released_recent_window_newest_first(self) -> None:
        _item("DayOld", media_type="game", release_date=_days(-1))
        _item("WeekOld", media_type="game", release_date=_days(-7))
        _item("Ancient", media_type="game", popularity=900, release_date=_days(-200))
        response = self.client.get(_list_url("game", "newly_released"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["DayOld", "WeekOld"])

    def test_game_now_playing_orders_by_rating_count_within_recent_window(self) -> None:
        # Game "now playing" spans a year (fresh releases carry no critic scores
        # yet), sorted by rating_count desc.
        _item("Hyped", media_type="game", release_date=_days(-10), rating_count=200)
        _item("Fresh", media_type="game", release_date=_days(-1), rating_count=50)
        _item("Ancient-Hyped", media_type="game", release_date=_days(-200), rating_count=999)
        response = self.client.get(_list_url("game", "now_playing"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Ancient-Hyped", "Hyped", "Fresh"])

    def test_game_top_rated_filtered_by_platform(self) -> None:
        from apps.media.models import MediaPlatform, Platform

        windows = Platform.objects.create(name="PC", slug="windows")
        switch = Platform.objects.create(name="Nintendo Switch", slug="nintendo-switch")
        w_best = _item("PC-Best", media_type="game", avg_rating=9.5, rating_count=10)
        w_mid = _item("PC-Mid", media_type="game", avg_rating=8.0, rating_count=6)
        s_best = _item("Switch-Best", media_type="game", avg_rating=9.9, rating_count=8)
        MediaPlatform.objects.create(media_item=w_best, platform=windows)
        MediaPlatform.objects.create(media_item=w_mid, platform=windows)
        MediaPlatform.objects.create(media_item=s_best, platform=switch)

        response = self.client.get(_list_url("game", "top_rated"), {"platform": "windows"})
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["PC-Best", "PC-Mid"])

    def test_game_popular_ignores_platform_filter_when_absent(self) -> None:
        from apps.media.models import MediaPlatform, Platform

        windows = Platform.objects.create(name="PC", slug="windows")
        pc = _item("PC", media_type="game", popularity=10)
        _item("Console", media_type="game", popularity=90)
        MediaPlatform.objects.create(media_item=pc, platform=windows)
        response = self.client.get(_list_url("game", "popular"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Console", "PC"])

    def test_game_rails_exclude_dlc_expansions_and_unrated_rows(self) -> None:
        # A stored main game ranks; DLC/expansion rows (whatever their rating)
        # and unrated rows never surface on the top_rated rail.
        _item("Real-Game", media_type="game", avg_rating=9.0, rating_count=7)
        _item("Expansion", media_type="game", game_type="dlc_addon", avg_rating=9.9, rating_count=7)
        _item("Unrated", media_type="game")
        response = self.client.get(_list_url("game", "top_rated"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Real-Game"])

    def test_game_best_on_platform_excludes_dlc(self) -> None:
        from apps.media.models import MediaPlatform, Platform

        windows = Platform.objects.create(name="PC", slug="windows")
        main = _item("Main-PC", media_type="game", avg_rating=8.5, rating_count=7)
        _item("PC-DLC", media_type="game", game_type="expansion", avg_rating=9.9, rating_count=7)
        MediaPlatform.objects.create(media_item=main, platform=windows)
        MediaPlatform.objects.create(
            media_item=MediaItem.objects.get(title="PC-DLC"), platform=windows
        )
        response = self.client.get(_list_url("game", "top_rated"), {"platform": "windows"})
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Main-PC"])

    def test_new_season_for_you_is_empty(self) -> None:
        _item("A-Show", media_type="show", popularity=90)
        response = self.client.get(_list_url("show", "new_season_for_you"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["has_more"], False)
        self.assertIsNone(response.data["next_cursor"])
        self.assertEqual(response.data["items"], [])

    def test_personalized_list_types_fall_back_to_popularity(self) -> None:
        top = _item("Alpha", popularity=90)
        _item("Beta", popularity=10)
        for list_type in ("collaborative", "semantic", "integration_steam", "integration_plex"):
            response = self.client.get(_list_url("movie", list_type))
            self.assertEqual(response.status_code, 200, list_type)
            self.assertEqual(response.data["items"][0]["id"], top.pk, list_type)

    # ── narrowing + adult policy ─────────────────────────────────────
    def test_artwork_requirement_drops_under_language_filter(self) -> None:
        logo_only = _item("En-Only", popularity=90, original_language="en", assets=("logo",))
        narrowed = self.client.get(_list_url("movie", "popular"), {"language": "en-US"})
        plain = self.client.get(_list_url("movie", "popular"))
        self.assertEqual([item["id"] for item in narrowed.data["items"]], [logo_only.pk])
        self.assertNotIn("En-Only", [item["title"] for item in plain.data["items"]])

    def test_is_anime_filter(self) -> None:
        _item("Shonen", popularity=90, original_language="ja", anime=True)
        _item("Live", popularity=80, original_language="en", anime=False)
        response = self.client.get(_list_url("movie", "popular"), {"is_anime": "true"})
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["Shonen"])

    def test_feed_excludes_adult_for_anon_but_staff_sees(self) -> None:
        _item("Family", popularity=1)
        adult = _item("Mature", popularity=500, is_adult=True)
        anon = self.client.get(_list_url("movie", "popular"))
        staff = self.staff_client.get(_list_url("movie", "popular"))
        anon_ids = [item["id"] for item in anon.data["items"]]
        staff_ids = [item["id"] for item in staff.data["items"]]
        self.assertNotIn(adult.pk, anon_ids)
        self.assertIn(adult.pk, staff_ids)

    def test_game_poster_counts_as_artwork(self) -> None:
        _item(
            "A-Game",
            media_type="game",
            popularity=50,
            assets=("logo", "poster"),
        )
        response = self.client.get(_list_url("game", "popular"))
        titles = [item["title"] for item in response.data["items"]]
        self.assertEqual(titles, ["A-Game"])

    # ── /sections ────────────────────────────────────────────────────
    SECTION_KEYS = {
        "id",
        "title",
        "media_type",
        "list_type",
        "genre",
        "language",
        "is_anime",
        "platform",
        "is_personalized",
        "reason",
    }

    _CANONICAL_SECTION_IDS = [
        "trending_movies",
        "trending_shows",
        "newly_released_games",
        "now_playing_games",
        "top_rated_games",
        "upcoming_games",
        "best_on_windows",
        "best_on_playstation_5",
        "best_on_xbox_series",
        "best_on_nintendo_switch",
    ]

    def test_sections_public_and_canonical(self) -> None:
        response = self.client.get("/api/v1/discover/sections")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"sections"})
        sections = response.data["sections"]
        self.assertEqual(len(sections), len(self._CANONICAL_SECTION_IDS))
        self.assertEqual({s["id"] for s in sections}, set(self._CANONICAL_SECTION_IDS))
        for section in sections:
            self.assertLessEqual(self.SECTION_KEYS, set(section.keys()))
            self.assertIn(section["media_type"], {"movie", "show", "game"})
            self.assertIn(
                section["list_type"],
                {"trending", "popular", "top_rated", "upcoming", "now_playing", "newly_released"},
            )
            self.assertIs(section["is_personalized"], False)

    def test_sections_default_for_authed_user_too(self) -> None:
        # Per-user generate_sections/compute_profile is deferred; an authed
        # caller still receives the canonical defaults (no crash).
        response = self.staff_client.get("/api/v1/discover/sections")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [s["id"] for s in response.data["sections"]],
            self._CANONICAL_SECTION_IDS,
        )


# ── Trending Shows (latest-season feed) ──────────────────────────────

SEASON_KEYS = {
    "id",
    "show_id",
    "show_title",
    "season_number",
    "name",
    "overview",
    "poster_url",
    "air_date",
}


def _make_show(
    title: str,
    *,
    seasons: list[tuple[int, date | None]],
    popularity: float = 0.0,
    is_adult: bool = False,
    original_language: str | None = None,
    is_anime: bool = False,
    genre: str | None = None,
    assets: tuple[str, ...] = (),
    season_poster: bool = True,
) -> Show:
    item = MediaItem.objects.create(
        media_type="show",
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{abs(hash(title)) % 10**6}",
        popularity=popularity,
        is_adult=is_adult,
        original_language=original_language,
    )
    for asset_type in assets:
        MediaAsset.objects.create(
            media_item=item, asset_type=asset_type, url=f"http://img/{item.pk}/{asset_type}.png"
        )
    show = Show.objects.create(media_item=item, is_anime=is_anime)
    for number, air_date in seasons:
        Season.objects.create(
            show=show,
            season_number=number,
            air_date=air_date,
            name=f"{title} S{number}",
            overview=f"{title} season {number}",
            poster_url=f"http://img/season/{show.pk}-{number}.png" if season_poster else None,
        )
    if genre:
        g, _ = Genre.objects.get_or_create(name=genre.title(), slug=genre)
        MediaGenre.objects.create(media_item=item, genre=g)
    return show


class TrendingShowsSeasonTests(TestCase):
    """/discover/season/trending returns each show's latest Season within window."""

    def setUp(self) -> None:
        from django.core.cache import cache
        cache.clear()
        self.staff = User.objects.create_user(
            username="mod2", password="a-strong-pass", is_staff=True
        )
        self.staff_token = Token.objects.create(user=self.staff)
        self.client = APIClient()  # anonymous
        self.staff_client = APIClient()
        self.staff_client.credentials(HTTP_AUTHORIZATION=f"Token {self.staff_token.key}")

    def tearDown(self) -> None:
        from django.core.cache import cache
        cache.clear()

    def _feed(self, params: dict | None = None):
        response = self.client.get(_list_url("season", "trending"), params or {})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"items", "has_more", "next_cursor"})
        return response.data["items"]

    def test_latest_season_within_window_is_the_item(self) -> None:
        show = _make_show("Runner", seasons=[(1, _days(-300)), (2, _days(-10))])
        items = self._feed()
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(set(item.keys()), SEASON_KEYS)
        self.assertEqual(item["show_id"], show.pk)
        self.assertEqual(item["season_number"], 2)
        self.assertEqual(item["show_title"], "Runner")
        self.assertEqual(item["name"], "Runner S2")
        self.assertEqual(item["air_date"], str(_days(-10)))

    def test_latest_out_of_window_drops_show_even_if_older_season_in_window(self) -> None:
        _make_show("Stale", seasons=[(1, _days(-300)), (2, _days(-400))])
        self.assertEqual(self._feed(), [])

    def test_null_air_date_latest_season_excluded(self) -> None:
        _make_show("Unreleased", seasons=[(1, _days(-10)), (2, None)])
        self.assertEqual(self._feed(), [])

    def test_future_in_window_included_but_far_future_excluded(self) -> None:
        _make_show("Announced", seasons=[(1, _days(30))])
        _make_show("Far-Off", seasons=[(1, _days(400))])
        titles = [i["show_title"] for i in self._feed()]
        self.assertEqual(titles, ["Announced"])

    def test_orders_newest_premiere_first(self) -> None:
        _make_show("Older", seasons=[(2, _days(-40))])
        _make_show("Newer", seasons=[(3, _days(-5))])
        titles = [i["show_title"] for i in self._feed()]
        self.assertEqual(titles, ["Newer", "Older"])

    def test_demotes_future_premieres_below_aired(self) -> None:
        # Not-yet-aired (announced) seasons still appear, but rank after every
        # already-aired season: aired newest-first, then future soonest-first.
        _make_show("Announced-Far", seasons=[(3, _days(60))])
        _make_show("Aired-Older", seasons=[(1, _days(-40))])
        _make_show("Announced-Soon", seasons=[(2, _days(10))])
        _make_show("Aired-Newer", seasons=[(4, _days(-5))])
        titles = [i["show_title"] for i in self._feed()]
        self.assertEqual(titles, ["Aired-Newer", "Aired-Older", "Announced-Soon", "Announced-Far"])

    def test_prefers_seasons_with_locally_mirrored_show_artwork(self) -> None:
        _make_show(
            "Remote-Show",
            seasons=[(1, _days(-5))],
            assets=("poster", "textless_poster"),
        )
        local = _make_show(
            "Local-Show",
            seasons=[(1, _days(-40))],
            assets=("poster", "textless_poster"),
        )
        MediaAsset.objects.filter(media_item=local.media_item, asset_type="poster").update(
            local_name="local-poster.png"
        )
        titles = [i["show_title"] for i in self._feed()]
        self.assertEqual(titles[0], "Local-Show")
        self.assertIn("Remote-Show", titles)

    def test_season_without_poster_falls_back_to_show_art(self) -> None:
        show = _make_show(
            "Poster-Less",
            seasons=[(2, _days(-5))],
            assets=("poster", "backdrop"),
            season_poster=False,
        )
        items = self._feed()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["show_title"], "Poster-Less")
        self.assertEqual(items[0]["poster_url"], f"http://img/{show.pk}/poster.png")

    def test_season_without_any_show_art_keeps_null_poster(self) -> None:
        _make_show("No-Art", seasons=[(2, _days(-5))], season_poster=False)
        items = self._feed()
        self.assertEqual(len(items), 1)
        self.assertIsNone(items[0]["poster_url"])

    def test_genre_filter(self) -> None:
        _make_show("Drama-One", seasons=[(1, _days(-10))], genre="drama")
        _make_show("Comedy-One", seasons=[(1, _days(-10))], genre="comedy")
        items = self._feed({"genre": "drama"})
        self.assertEqual([i["show_title"] for i in items], ["Drama-One"])

    def test_language_filter(self) -> None:
        _make_show("En-One", seasons=[(1, _days(-10))], original_language="en")
        _make_show("Ja-One", seasons=[(1, _days(-10))], original_language="ja")
        items = self._feed({"language": "en"})
        self.assertEqual([i["show_title"] for i in items], ["En-One"])

    def test_is_anime_filter(self) -> None:
        _make_show("Anime-One", seasons=[(1, _days(-10))], is_anime=True)
        _make_show("Live-One", seasons=[(1, _days(-10))], is_anime=False)
        items = self._feed({"is_anime": "true"})
        self.assertEqual([i["show_title"] for i in items], ["Anime-One"])

    def test_adult_excluded_for_anon_but_staff_sees(self) -> None:
        adult = _make_show("Mature-Show", seasons=[(1, _days(-10))], is_adult=True)
        _make_show("Family-Show", seasons=[(1, _days(-10))])
        anon_titles = [i["show_title"] for i in self._feed()]
        self.assertNotIn("Mature-Show", anon_titles)
        response = self.staff_client.get(_list_url("season", "trending"))
        self.assertEqual(response.status_code, 200)
        staff_ids = [i["show_id"] for i in response.data["items"]]
        self.assertIn(adult.pk, staff_ids)

    def test_trending_seasons_excludes_talk_shows(self) -> None:
        normal_show = _make_show("Normal Show", seasons=[(1, _days(-10))])
        talk_show = _make_show("Nightly Talk Show", seasons=[(1, _days(-5))], genre="talk")

        anon_items = self._feed()
        show_ids = [item["show_id"] for item in anon_items]
        self.assertIn(normal_show.pk, show_ids)
        self.assertNotIn(talk_show.pk, show_ids)

    def test_movie_trending_still_returns_media_item_summary(self) -> None:
        _item("Film", popularity=90, release_date=_days(-5))
        _make_show("Runner", seasons=[(1, _days(-10))])
        response = self.client.get(_list_url("movie", "trending"))
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertTrue(items)
        item = items[0]
        self.assertEqual(item["media_type"], "movie")
        self.assertLessEqual(SUMMARY_KEYS, set(item.keys()))
        self.assertNotIn("show_id", item)

    def test_show_trending_returns_normal_show_summary(self) -> None:
        # show/trending is the generic shows feed again; the latest-season
        # behavior lives at /discover/season/trending instead.
        _make_show("Runner", seasons=[(1, _days(-10))])
        top = _item(
            "Fresh-Show",
            media_type="show",
            popularity=90,
            release_date=_days(-5),
        )
        response = self.client.get(_list_url("show", "trending"))
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertTrue(items)
        item = items[0]
        self.assertEqual(item["id"], top.pk)
        self.assertEqual(item["media_type"], "show")
        self.assertLessEqual(SUMMARY_KEYS, set(item.keys()))
        self.assertNotIn("show_id", item)

    def test_hero_excludes_talk_shows(self) -> None:
        normal = _item("Normal Show", media_type="show", popularity=100)
        talk = _item("Late Night Talk", media_type="show", popularity=200)
        talk_genre, _ = Genre.objects.get_or_create(name="Talk", slug="talk")
        MediaGenre.objects.create(media_item=talk, genre=talk_genre)

        response = self.client.get("/api/v1/discover/hero?limit=10")
        self.assertEqual(response.status_code, 200)
        pks = [item["id"] for item in response.data["items"]]
        self.assertIn(normal.pk, pks)
        self.assertNotIn(talk.pk, pks)

    def test_show_trending_excludes_talk_shows(self) -> None:
        normal = _item(
            "Drama Series",
            media_type="show",
            popularity=100,
            release_date=_days(-10),
        )
        talk = _item(
            "Tonight Talk Show",
            media_type="show",
            popularity=200,
            release_date=_days(-5),
        )
        talk_genre, _ = Genre.objects.get_or_create(name="Talk", slug="talk")
        MediaGenre.objects.create(media_item=talk, genre=talk_genre)

        # Default trending rail excludes talk shows
        response = self.client.get(_list_url("show", "trending"))
        self.assertEqual(response.status_code, 200)
        pks = [item["id"] for item in response.data["items"]]
        self.assertIn(normal.pk, pks)
        self.assertNotIn(talk.pk, pks)

        # Explicit genre=talk query still returns talk shows
        talk_response = self.client.get(_list_url("show", "trending"), {"genre": "talk"})
        self.assertEqual(talk_response.status_code, 200)
        talk_pks = [item["id"] for item in talk_response.data["items"]]
        self.assertIn(talk.pk, talk_pks)
        self.assertNotIn(normal.pk, talk_pks)

    def test_trending_seasons_personalization_prioritizes_user_interactions(self) -> None:
        from apps.social.models import UserMediaInteraction

        older_show = _make_show("User-Watched-Older", seasons=[(1, _days(-100))])
        _make_show("General-Newer", seasons=[(1, _days(-10))])

        # Anonymous gets newer first
        anon_resp = self.client.get(_list_url("season", "trending"))
        self.assertEqual(anon_resp.status_code, 200)
        anon_titles = [item["show_title"] for item in anon_resp.data["items"]]
        self.assertEqual(anon_titles, ["General-Newer", "User-Watched-Older"])

        # Authenticated user who watched or watchlisted older_show sees older_show first
        UserMediaInteraction.objects.create(
            user=self.staff,
            media_item=older_show.media_item,
            interaction_type="watchlisted",
        )
        auth_resp = self.staff_client.get(_list_url("season", "trending"))
        self.assertEqual(auth_resp.status_code, 200)
        auth_titles = [item["show_title"] for item in auth_resp.data["items"]]
        self.assertEqual(auth_titles, ["User-Watched-Older", "General-Newer"])

    def test_trending_seasons_personalization_prioritizes_user_episode_interactions(self) -> None:
        from apps.social.models import UserEpisodeInteraction

        older_show = _make_show("Ep-Watched-Older", seasons=[(1, _days(-100))])
        _make_show("Ep-General-Newer", seasons=[(1, _days(-10))])
        season = older_show.seasons.first()
        episode = Episode.objects.create(season=season, episode_number=1, name="Ep 1")

        UserEpisodeInteraction.objects.create(user=self.staff, episode=episode)

        auth_resp = self.staff_client.get(_list_url("season", "trending"))
        self.assertEqual(auth_resp.status_code, 200)
        auth_titles = [item["show_title"] for item in auth_resp.data["items"]]
        self.assertEqual(auth_titles, ["Ep-Watched-Older", "Ep-General-Newer"])
