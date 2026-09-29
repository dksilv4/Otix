"""Tests for TMDB movie collection hydration, linking, and detail serialization."""

from __future__ import annotations

from django.test import TestCase
from rest_framework.test import APIClient

from apps.lists.models import Collection, CollectionItem
from apps.media.models import ExternalID, MediaItem, Movie
from apps.media.serializers import MediaItemDetailSerializer
from apps.media.services.catalog import media_detail_queryset
from core.providers.tmdb.hydrators import seed_movie_from_tmdb


class CollectionHydratorTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

        self.movie_1_raw = {
            "id": 101,
            "title": "Star Wars: Episode IV - A New Hope",
            "overview": "Luke Skywalker joins forces with a Jedi Knight.",
            "release_date": "1977-05-25",
            "runtime": 121,
            "budget": 11000000,
            "revenue": 775398007,
            "poster_path": "/star_wars_iv_poster.jpg",
            "backdrop_path": "/star_wars_iv_backdrop.jpg",
            "belongs_to_collection": {
                "id": 10,
                "name": "Star Wars Collection",
                "poster_path": "/star_wars_coll_poster.jpg",
                "backdrop_path": "/star_wars_coll_backdrop.jpg",
                "overview": "An epic space-opera media franchise.",
            },
        }

        self.movie_2_raw = {
            "id": 102,
            "title": "Star Wars: Episode V - The Empire Strikes Back",
            "overview": "The epic adventure continues as the Empire prepares.",
            "release_date": "1980-05-21",
            "runtime": 124,
            "budget": 18000000,
            "revenue": 538375067,
            "poster_path": "/star_wars_v_poster.jpg",
            "backdrop_path": "/star_wars_v_backdrop.jpg",
            "belongs_to_collection": {
                "id": 10,
                "name": "Star Wars Collection",
                "poster_path": "/star_wars_coll_poster.jpg",
                "backdrop_path": "/star_wars_coll_backdrop.jpg",
            },
        }

    def test_seed_movie_creates_and_links_collection(self) -> None:
        media_id = seed_movie_from_tmdb(self.movie_1_raw)
        media = MediaItem.objects.get(pk=media_id)
        movie = Movie.objects.get(media_item=media)

        self.assertIsNotNone(movie.collection)
        coll = movie.collection
        self.assertEqual(coll.name, "Star Wars Collection")
        self.assertEqual(coll.overview, "An epic space-opera media franchise.")
        self.assertIn("star_wars_coll_poster.jpg", coll.poster_url or "")
        self.assertIn("star_wars_coll_backdrop.jpg", coll.backdrop_url or "")

        # ExternalID check
        ext = ExternalID.objects.filter(
            provider="tmdb", external_id="10", content_type__model="collection"
        ).first()
        self.assertIsNotNone(ext)
        self.assertEqual(ext.object_id, coll.pk)

        # CollectionItem join
        join = CollectionItem.objects.filter(collection=coll, media_item=media).first()
        self.assertIsNotNone(join)

        # Franchise link
        self.assertIsNotNone(coll.franchise)
        self.assertEqual(coll.franchise.slug, "star-wars")

    def test_multiple_movies_share_same_collection(self) -> None:
        media_id_1 = seed_movie_from_tmdb(self.movie_1_raw)
        media_id_2 = seed_movie_from_tmdb(self.movie_2_raw)

        self.assertEqual(Collection.objects.count(), 1)
        coll = Collection.objects.get()

        movie_1 = Movie.objects.get(media_item_id=media_id_1)
        movie_2 = Movie.objects.get(media_item_id=media_id_2)

        self.assertEqual(movie_1.collection, coll)
        self.assertEqual(movie_2.collection, coll)

        item_ids = list(coll.items.values_list("media_item_id", flat=True))
        self.assertIn(media_id_1, item_ids)
        self.assertIn(media_id_2, item_ids)

    def test_media_detail_serializer_includes_collection_and_movies(self) -> None:
        media_id_1 = seed_movie_from_tmdb(self.movie_1_raw)
        media_id_2 = seed_movie_from_tmdb(self.movie_2_raw)

        item = media_detail_queryset(media_id_1)
        self.assertIsNotNone(item)
        data = MediaItemDetailSerializer(item).data

        self.assertIn("collection", data)
        coll_data = data["collection"]
        self.assertIsNotNone(coll_data)
        self.assertEqual(coll_data["name"], "Star Wars Collection")
        self.assertEqual(len(coll_data["movies"]), 2)

        # Movies sorted chronologically by release_date
        self.assertEqual(coll_data["movies"][0]["id"], media_id_1)
        self.assertEqual(coll_data["movies"][1]["id"], media_id_2)

        # Check fields on collection movie entry
        first_movie = coll_data["movies"][0]
        self.assertIn("id", first_movie)
        self.assertIn("title", first_movie)
        self.assertIn("slug", first_movie)
        self.assertIn("release_date", first_movie)
        self.assertIn("is_adult", first_movie)
        self.assertFalse(first_movie["is_adult"])

        # Movie 2 poster url resolved
        second_movie = coll_data["movies"][1]
        self.assertIn("star_wars_v_poster.jpg", second_movie["poster_url"] or "")

    def test_detail_endpoint_returns_collection(self) -> None:
        media_id = seed_movie_from_tmdb(self.movie_1_raw)
        response = self.client.get(f"/api/v1/media/movie/{media_id}")
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertIn("collection", json_data)
        self.assertIsNotNone(json_data["collection"])
        self.assertEqual(json_data["collection"]["name"], "Star Wars Collection")
