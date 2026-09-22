"""Unit tests for TMDB pure transformers.

Tests pure function conversions of TMDB raw API payloads into canonical
NormalizedMediaItem, NormalizedCredit, NormalizedAsset, NormalizedCompany,
NormalizedVideo, NormalizedSeason, and NormalizedEpisode instances.
"""

from __future__ import annotations

from datetime import date
from unittest import TestCase

from core.providers.framework import (
    NormalizedAsset,
    NormalizedCompany,
    NormalizedCredit,
    NormalizedEpisode,
    NormalizedMediaItem,
    NormalizedSeason,
    NormalizedVideo,
    load_fixture,
)
from core.providers.tmdb.transformers import (
    image_url,
    transform_asset,
    transform_company,
    transform_credit,
    transform_episode,
    transform_movie,
    transform_season,
    transform_show,
    transform_video,
    transform_watch_providers,
)


class TMDBTransformersTests(TestCase):
    """Pure unit tests for TMDB payload transformers using fixtures."""

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.movie_raw = load_fixture("tmdb", "movie_550")
        cls.show_raw = load_fixture("tmdb", "tv_1399")
        cls.season_raw = load_fixture("tmdb", "season_1")

    def test_image_url_helper(self) -> None:
        self.assertEqual(
            image_url("/path.jpg", size="w500"),
            "https://image.tmdb.org/t/p/w500/path.jpg",
        )
        self.assertIsNone(image_url(None))
        self.assertIsNone(image_url(""))

    def test_transform_movie_full_fixture(self) -> None:
        item = transform_movie(self.movie_raw)
        self.assertIsInstance(item, NormalizedMediaItem)
        self.assertEqual(item.media_type, "movie")
        self.assertEqual(item.title, "Fight Club")
        self.assertEqual(item.original_title, "Fight Club")
        self.assertEqual(item.release_date, date(1999, 10, 15))
        self.assertEqual(item.runtime_minutes, 139)
        self.assertEqual(item.status, "Released")
        self.assertEqual(item.content_rating, "R")
        self.assertTrue(len(item.payload_hash) > 0)

        # External IDs
        self.assertEqual(item.external_ids["tmdb"], "550")
        self.assertEqual(item.external_ids["imdb"], "tt0137523")
        self.assertEqual(item.external_ids["wikidata"], "Q180563")

        # Genres
        self.assertEqual(item.genres, ("Drama", "Thriller"))

        # Assets
        asset_types = {a.asset_type for a in item.assets}
        self.assertIn("poster", asset_types)
        self.assertIn("backdrop", asset_types)
        self.assertIn("logo", asset_types)
        self.assertIn("textless_poster", asset_types)
        primary_poster = next(a for a in item.assets if a.asset_type == "poster")
        self.assertEqual(primary_poster.score, 100)
        self.assertEqual(primary_poster.provider, "tmdb")

        # Credits
        self.assertEqual(len(item.credits), 4)
        cast_names = [c.name for c in item.credits if c.role == "cast"]
        self.assertEqual(cast_names, ["Edward Norton", "Brad Pitt", "Helena Bonham Carter"])
        crew = next(c for c in item.credits if c.role == "crew")
        self.assertEqual(crew.name, "David Fincher")
        self.assertEqual(crew.job, "Director")

        # Companies
        self.assertTrue(any(c.name == "Regency Enterprises" for c in item.companies))

        # Ratings
        self.assertEqual(len(item.ratings), 1)
        self.assertEqual(item.ratings[0].provider, "tmdb")
        self.assertEqual(item.ratings[0].score, 8.433)
        self.assertEqual(item.ratings[0].max_score, 10.0)

        # Videos
        self.assertEqual(len(item.videos), 1)
        self.assertEqual(item.videos[0].video_id, "oB6q8T4P4eA")
        self.assertEqual(item.videos[0].site, "youtube")

    def test_transform_show_full_fixture(self) -> None:
        item = transform_show(self.show_raw)
        self.assertIsInstance(item, NormalizedMediaItem)
        self.assertEqual(item.media_type, "show")
        self.assertEqual(item.title, "Game of Thrones")
        self.assertEqual(item.release_date, date(2011, 4, 17))
        self.assertEqual(item.status, "Ended")
        self.assertEqual(item.content_rating, "TV-MA")

        # External IDs
        self.assertEqual(item.external_ids["tmdb"], "1399")
        self.assertEqual(item.external_ids["imdb"], "tt0944947")
        self.assertEqual(item.external_ids["tvdb"], "121361")

        # Seasons transformed from summary
        self.assertEqual(len(item.seasons), 1)
        self.assertEqual(item.seasons[0].season_number, 1)
        self.assertEqual(item.seasons[0].name, "Season 1")

        # Networks & Companies
        companies = {c.name: c.role for c in item.companies}
        self.assertEqual(companies.get("Revolution Sun Studios"), "production")
        self.assertEqual(companies.get("HBO"), "network")

    def test_transform_season_and_episodes(self) -> None:
        season = transform_season(self.season_raw)
        self.assertIsInstance(season, NormalizedSeason)
        self.assertEqual(season.season_number, 1)
        self.assertEqual(season.name, "Season 1")
        self.assertEqual(season.air_date, date(2011, 4, 17))
        self.assertEqual(len(season.episodes), 2)

        ep1 = season.episodes[0]
        self.assertIsInstance(ep1, NormalizedEpisode)
        self.assertEqual(ep1.episode_number, 1)
        self.assertEqual(ep1.season_number, 1)
        self.assertEqual(ep1.title, "Winter Is Coming")
        self.assertEqual(ep1.runtime_minutes, 62)
        self.assertEqual(ep1.air_date, date(2011, 4, 17))

    def test_transform_episode_direct(self) -> None:
        raw = {
            "episode_number": 5,
            "name": "The Wolf and the Lion",
            "air_date": "2011-05-15",
            "overview": "Ned seeks answers.",
            "runtime": 55,
        }
        ep = transform_episode(raw, season_number=1)
        self.assertIsInstance(ep, NormalizedEpisode)
        self.assertEqual(ep.episode_number, 5)
        self.assertEqual(ep.season_number, 1)
        self.assertEqual(ep.title, "The Wolf and the Lion")
        self.assertEqual(ep.runtime_minutes, 55)
        self.assertEqual(ep.air_date, date(2011, 5, 15))

    def test_transform_credit(self) -> None:
        cast_raw = {
            "id": 819,
            "name": "Edward Norton",
            "character": "The Narrator",
            "order": 0,
            "profile_path": "/norton.jpg",
        }
        credit = transform_credit(cast_raw, role="cast")
        self.assertIsInstance(credit, NormalizedCredit)
        self.assertEqual(credit.person_id, "819")
        self.assertEqual(credit.name, "Edward Norton")
        self.assertEqual(credit.character, "The Narrator")
        self.assertEqual(credit.role, "cast")
        self.assertIn("norton.jpg", credit.photo_url or "")

    def test_transform_company(self) -> None:
        comp_raw = {
            "id": 508,
            "name": "Regency Enterprises",
            "logo_path": "/cxw.jpg",
        }
        comp = transform_company(comp_raw, role="production")
        self.assertIsInstance(comp, NormalizedCompany)
        self.assertEqual(comp.company_id, "508")
        self.assertEqual(comp.name, "Regency Enterprises")
        self.assertEqual(comp.role, "production")
        self.assertIn("cxw.jpg", comp.logo_url or "")

    def test_transform_video(self) -> None:
        vid_raw = {
            "id": "123",
            "key": "xyz789",
            "name": "Teaser Trailer",
            "site": "YouTube",
            "type": "Teaser",
        }
        video = transform_video(vid_raw)
        self.assertIsNotNone(video)
        assert video is not None
        self.assertIsInstance(video, NormalizedVideo)
        self.assertEqual(video.video_id, "xyz789")
        self.assertEqual(video.site, "youtube")
        self.assertEqual(video.video_type, "teaser")

    def test_transform_video_invalid_skipped(self) -> None:
        self.assertIsNone(transform_video({"name": "No Key"}))
        self.assertIsNone(transform_video({"key": "123"}))

    def test_transform_asset(self) -> None:
        entry = {"file_path": "/p1.jpg", "width": 500, "height": 750, "iso_639_1": "en"}
        asset = transform_asset(entry, "poster", score=90)
        self.assertIsNotNone(asset)
        assert asset is not None
        self.assertIsInstance(asset, NormalizedAsset)
        self.assertEqual(asset.asset_type, "poster")
        self.assertEqual(asset.width, 500)
        self.assertEqual(asset.height, 750)
        self.assertEqual(asset.language, "en")
        self.assertEqual(asset.score, 90)

    def test_transform_movie_missing_id_raises(self) -> None:
        with self.assertRaises(ValueError):
            transform_movie({"title": "Untitled"})

    def test_transform_show_missing_id_raises(self) -> None:
        with self.assertRaises(ValueError):
            transform_show({"name": "Untitled"})

    def test_transform_watch_providers(self) -> None:
        raw = {
            "results": {
                "US": {
                    "flatrate": [
                        {
                            "provider_id": 8,
                            "provider_name": "Netflix",
                            "logo_path": "/netflix.jpg",
                        }
                    ]
                }
            }
        }
        res = transform_watch_providers(raw)
        self.assertIn("US", res)
        self.assertEqual(res["US"][0]["provider_name"], "Netflix")
        self.assertEqual(res["US"][0]["monetization_type"], "flatrate")
