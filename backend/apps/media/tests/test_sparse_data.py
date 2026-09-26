"""Regression: sparse catalog rows must serialize, never 500.

Backfills/ingests frequently leave MediaItems with very little attached data —
no artwork assets, no genres/credits/watch providers, shows whose seasons have
no episodes, an empty discover rail. Every read path here must return 200 and
emit ``[]``/``null`` for the missing parts instead of dereferencing a field or
relation that is absent.
"""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.media.models import Episode, Game, MediaItem, Movie, Season, Show


class SparseCatalogTests(TestCase):
    def setUp(self) -> None:
        cache.clear()
        self.client = APIClient()

    def _item(self, media_type: str, title: str) -> MediaItem:
        return MediaItem.objects.create(
            media_type=media_type,
            title=title,
            slug=title.lower().replace(" ", "-"),
            release_date=None,
        )

    def test_movie_with_only_subtype_serializes_null_and_empty_lists(self) -> None:
        item = self._item("movie", "Bare Bones")
        Movie.objects.create(media_item=item)

        response = self.client.get(f"/api/v1/media/movie/{item.pk}")
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIsNone(data["poster_url"])
        self.assertIsNone(data["backdrop_url"])
        self.assertIsNone(data["logo_url"])
        self.assertIsNone(data["release_date"])
        self.assertIsNotNone(data["movie"])
        for key in ("genres", "credits", "watch_providers", "platforms", "game_modes"):
            self.assertEqual(data[key], [])
        self.assertEqual(data["screenshots"], [])
        self.assertEqual(data["videos"], [])

    def test_show_seasons_without_episodes_serialize(self) -> None:
        item = self._item("show", "Empty Episodes")
        show = Show.objects.create(media_item=item)
        Season.objects.create(show=show, season_number=1, name="First")
        Season.objects.create(show=show, season_number=2, name="Second")

        response = self.client.get(f"/api/v1/media/show/{item.pk}")
        self.assertEqual(response.status_code, 200)
        seasons = response.data["show"]["seasons"]
        self.assertEqual(len(seasons), 2)
        for season in seasons:
            self.assertEqual(season["episodes"], [])
            self.assertEqual(season["episode_count"], 0)

    def test_show_episodes_serialize_when_season_has_none(self) -> None:
        """A show whose season has a single episode must still list cleanly."""
        item = self._item("show", "One Episode")
        show = Show.objects.create(media_item=item)
        season = Season.objects.create(show=show, season_number=1)
        Episode.objects.create(season=season, episode_number=1, name="Pilot")

        response = self.client.get(f"/api/v1/media/show/{item.pk}")
        self.assertEqual(response.status_code, 200)
        seasons = response.data["show"]["seasons"]
        self.assertEqual(len(seasons), 1)
        self.assertEqual(seasons[0]["episode_count"], 1)
        self.assertEqual(len(seasons[0]["episodes"]), 1)

    def test_game_without_relations_serializes(self) -> None:
        item = self._item("game", "Bare Game")
        Game.objects.create(media_item=item)

        response = self.client.get(f"/api/v1/media/game/{item.pk}")
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIsNotNone(data["game"])
        for key in ("genres", "involved_companies", "platforms", "game_modes", "watch_providers"):
            self.assertEqual(data[key], [])

    def test_discover_rail_is_empty_not_error_when_catalog_empty(self) -> None:
        """A discover list_type over a media type with zero rows returns an empty
        feed (items==[]) rather than erroring on nothing to map."""
        response = self.client.get("/api/v1/discover/show/trending")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"], [])
        self.assertFalse(response.data["has_more"])
        self.assertIsNone(response.data["next_cursor"])
