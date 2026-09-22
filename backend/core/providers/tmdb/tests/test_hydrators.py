"""Unit and integration tests for TMDB database hydrators."""

from __future__ import annotations

from django.test import TestCase

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    Episode,
    ExternalID,
    ExternalRating,
    MediaAsset,
    MediaItem,
    MediaRelease,
    MediaVideo,
    Movie,
    Season,
    Show,
)
from apps.media.models.genre import Genre
from apps.people.models import MediaCredit, Person
from core.providers.framework import load_fixture
from core.providers.tmdb.hydrators import (
    seed_company_from_tmdb,
    seed_episodes_from_season,
    seed_movie_from_tmdb,
    seed_season_from_tmdb,
    seed_show_from_tmdb,
)


class TMDBHydratorTests(TestCase):
    """Test suite for TMDB database seeding logic."""

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.movie_raw = load_fixture("tmdb", "movie_550")
        cls.show_raw = load_fixture("tmdb", "tv_1399")
        cls.season_raw = load_fixture("tmdb", "season_1")

    def test_seed_movie_creates_entities_and_relations(self) -> None:
        media_id = seed_movie_from_tmdb(self.movie_raw)
        self.assertIsInstance(media_id, int)

        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.title, "Fight Club")
        self.assertEqual(media.media_type, "movie")
        self.assertEqual(media.original_language, "en")

        movie = Movie.objects.get(media_item_id=media_id)
        self.assertEqual(movie.runtime, 139)
        self.assertEqual(movie.budget, 63000000)

        # External IDs
        exts = set(
            ExternalID.objects.filter(object_id=media_id).values_list("provider", "external_id")
        )
        self.assertIn(("tmdb", "550"), exts)
        self.assertIn(("imdb", "tt0137523"), exts)

        # Credits & Persons
        credits_qs = MediaCredit.objects.filter(media_item_id=media_id)
        self.assertTrue(credits_qs.exists())
        self.assertTrue(Person.objects.filter(name="Edward Norton").exists())

        # Assets
        assets_qs = MediaAsset.objects.filter(media_item_id=media_id)
        self.assertTrue(assets_qs.filter(asset_type="poster").exists())
        self.assertTrue(assets_qs.filter(asset_type="backdrop").exists())

        # Companies
        self.assertTrue(
            InvolvedCompany.objects.filter(media_item_id=media_id, production=True).exists()
        )
        self.assertTrue(Company.objects.filter(name="Regency Enterprises").exists())

        # Releases, Videos, Rating
        self.assertTrue(MediaRelease.objects.filter(media_item_id=media_id).exists())
        self.assertTrue(MediaVideo.objects.filter(media_item_id=media_id).exists())
        self.assertTrue(
            ExternalRating.objects.filter(media_item_id=media_id, provider="tmdb").exists()
        )

        # Genres
        genres = list(
            Genre.objects.filter(
                media_genres__media_item_id=media_id
            ).values_list("name", flat=True)
        )
        self.assertIn("Drama", genres)
        self.assertIn("Thriller", genres)

        # Idempotency
        second_id = seed_movie_from_tmdb(self.movie_raw)
        self.assertEqual(media_id, second_id)
        self.assertEqual(MediaItem.objects.filter(pk=media_id).count(), 1)

    def test_seed_show_creates_entities_and_seasons(self) -> None:
        media_id = seed_show_from_tmdb(self.show_raw)
        self.assertIsInstance(media_id, int)

        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.title, "Game of Thrones")
        self.assertEqual(media.media_type, "show")

        show = Show.objects.get(media_item_id=media_id)
        self.assertEqual(show.status, "Ended")
        self.assertEqual(show.number_of_seasons, 8)

        # Seasons
        seasons_qs = Season.objects.filter(show_id=media_id)
        self.assertTrue(seasons_qs.filter(season_number=1).exists())

        # Networks
        self.assertTrue(Company.objects.filter(name="HBO").exists())

        # Idempotency
        second_id = seed_show_from_tmdb(self.show_raw)
        self.assertEqual(media_id, second_id)

    def test_seed_episodes_from_season(self) -> None:
        show_id = seed_show_from_tmdb(self.show_raw)
        created_count = seed_episodes_from_season(show_id, 1, self.season_raw)
        self.assertEqual(created_count, 2)

        episodes = Episode.objects.filter(season__show_id=show_id, season__season_number=1)
        self.assertEqual(episodes.count(), 2)
        ep1 = episodes.get(episode_number=1)
        self.assertEqual(ep1.name, "Winter Is Coming")
        self.assertEqual(ep1.runtime, 62)

        # Reseed is idempotent
        reseed_count = seed_season_from_tmdb(show_id, 1, self.season_raw)
        self.assertEqual(reseed_count, 0)
        self.assertEqual(episodes.count(), 2)

    def test_seed_company_from_tmdb(self) -> None:
        raw_company = {
            "id": 508,
            "name": "Regency Enterprises",
            "description": "Entertainment company",
            "homepage": "http://www.newregency.com",
            "origin_country": "US",
            "logo_path": "/cxw.jpg",
        }
        company_id = seed_company_from_tmdb(raw_company)
        self.assertIsInstance(company_id, int)

        company = Company.objects.get(pk=company_id)
        self.assertEqual(company.name, "Regency Enterprises")
        self.assertEqual(company.origin_country, "US")
        self.assertIn("cxw.jpg", company.logo_url or "")

        ext = ExternalID.objects.get(
            provider="tmdb", external_id="508", content_type__model="company"
        )
        self.assertEqual(ext.object_id, company.pk)
