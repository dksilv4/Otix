"""Pure unit tests for IGDB payload transformers using co-located fixtures."""

from __future__ import annotations

from datetime import date

from django.test import SimpleTestCase

from core.providers.framework import (
    NormalizedCompany,
    NormalizedMediaItem,
    NormalizedVideo,
    load_fixture,
)
from core.providers.igdb.schemas import (
    cover_url,
    game_type_label,
    image_url,
)
from core.providers.igdb.transformers import (
    transform_asset,
    transform_company,
    transform_game,
    transform_video,
)


class IGDBTransformerTests(SimpleTestCase):
    """Verify normalization of IGDB raw payloads into canonical framework entities."""

    def test_transform_game_with_id_fixture(self) -> None:
        fixture = load_fixture("igdb", "games/id.json")
        self.assertIsInstance(fixture, list)
        raw_game = fixture[0]

        normalized = transform_game(raw_game)
        self.assertIsInstance(normalized, NormalizedMediaItem)

        # Core identity
        self.assertEqual(normalized.media_type, "game")
        self.assertEqual(normalized.title, "The Witcher 3: Wild Hunt")
        self.assertEqual(normalized.release_date, date(2015, 5, 19))
        self.assertEqual(normalized.status, "released")
        self.assertIn("Geralt of Rivia", normalized.overview or "")

        # External IDs
        self.assertEqual(normalized.external_ids.get("igdb"), "1942")
        self.assertEqual(normalized.external_ids.get("steam"), "292030")
        self.assertEqual(normalized.external_ids.get("gog"), "1207664643")

        # Genres
        self.assertIn("Role-playing (RPG)", normalized.genres)
        self.assertIn("Adventure", normalized.genres)

        # Companies
        self.assertTrue(len(normalized.companies) >= 1)
        cd_projekt = normalized.companies[0]
        self.assertIsInstance(cd_projekt, NormalizedCompany)
        self.assertEqual(cd_projekt.name, "CD Projekt RED")
        self.assertEqual(cd_projekt.company_id, "1104")
        self.assertEqual(cd_projekt.role, "production")
        self.assertIn("cl3e.jpg", cd_projekt.logo_url or "")

        # Ratings
        self.assertEqual(len(normalized.ratings), 2)
        ratings_by_type = {r.type: r for r in normalized.ratings}
        self.assertIn("critic", ratings_by_type)
        self.assertIn("audience", ratings_by_type)
        self.assertAlmostEqual(ratings_by_type["critic"].score, 91.5)
        self.assertEqual(ratings_by_type["critic"].votes, 38)
        self.assertAlmostEqual(ratings_by_type["audience"].score, 93.8)
        self.assertEqual(ratings_by_type["audience"].votes, 3410)

        # Videos
        self.assertEqual(len(normalized.videos), 1)
        vid = normalized.videos[0]
        self.assertIsInstance(vid, NormalizedVideo)
        self.assertEqual(vid.video_id, "c0i88t0Kacs")
        self.assertEqual(vid.title, "Trailer")
        self.assertEqual(vid.site, "youtube")

        # Age Ratings / Certification
        self.assertEqual(normalized.content_rating, "ESRB: 0")

        # Assets (cover, screenshots, artworks)
        asset_types = {a.asset_type for a in normalized.assets}
        self.assertIn("poster", asset_types)
        self.assertIn("screenshot", asset_types)
        self.assertIn("backdrop", asset_types)

        poster = next(a for a in normalized.assets if a.asset_type == "poster")
        self.assertIn("co1wyy.jpg", poster.url)
        self.assertEqual(poster.score, 100)

        screenshots = [a for a in normalized.assets if a.asset_type == "screenshot"]
        self.assertEqual(len(screenshots), 2)
        self.assertEqual(screenshots[0].width, 1920)
        self.assertEqual(screenshots[0].height, 1080)

        # Payload hash
        self.assertTrue(len(normalized.payload_hash) == 64)

    def test_transform_game_fixtures_collection(self) -> None:
        fixtures_to_test = [
            "games/popular.json",
            "games/recent.json",
            "games/search.json",
            "games/upcoming.json",
        ]
        for fixture_name in fixtures_to_test:
            data = load_fixture("igdb", fixture_name)
            self.assertIsInstance(data, list)
            for item in data:
                res = transform_game(item)
                self.assertEqual(res.media_type, "game")
                self.assertTrue(bool(res.title))
                self.assertIn("igdb", res.external_ids)

    def test_transform_company_helper(self) -> None:
        entry = {
            "company": {
                "id": 42,
                "name": "FromSoftware &amp; Co",
                "logo": {"image_id": "fslogo"},
            },
            "developer": True,
            "publisher": False,
        }
        comp = transform_company(entry)
        self.assertIsNotNone(comp)
        assert comp is not None
        self.assertEqual(comp.company_id, "42")
        self.assertEqual(comp.name, "FromSoftware & Co")
        self.assertEqual(comp.role, "production")
        self.assertIn("fslogo.jpg", comp.logo_url or "")

        # Publisher only role
        entry_pub = {
            "company": {"id": 43, "name": "Bandai Namco"},
            "developer": False,
            "publisher": True,
        }
        comp_pub = transform_company(entry_pub)
        assert comp_pub is not None
        self.assertEqual(comp_pub.role, "distributor")

    def test_transform_video_helper(self) -> None:
        video_entry = {"video_id": "abc123xyz", "name": "Official Gameplay Trailer"}
        video = transform_video(video_entry)
        self.assertIsNotNone(video)
        assert video is not None
        self.assertEqual(video.video_id, "abc123xyz")
        self.assertEqual(video.title, "Official Gameplay Trailer")
        self.assertEqual(video.site, "youtube")
        self.assertEqual(video.video_type, "trailer")

        # Missing ID returns None
        self.assertIsNone(transform_video({"name": "No ID"}))

    def test_transform_asset_helper(self) -> None:
        entry = {"image_id": "img123", "width": 1920, "height": 1080}
        asset = transform_asset(entry, "screenshot", score=85)
        self.assertIsNotNone(asset)
        assert asset is not None
        self.assertEqual(asset.asset_type, "screenshot")
        self.assertEqual(asset.width, 1920)
        self.assertEqual(asset.height, 1080)
        self.assertEqual(asset.score, 85)
        self.assertIn("img123.jpg", asset.url)

    def test_cover_url_and_image_url(self) -> None:
        self.assertIn("t_original/co123.jpg", cover_url({"image_id": "co123"}) or "")
        self.assertIn("t_original/co456.jpg", cover_url("co456") or "")
        self.assertIsNone(cover_url(None))
        self.assertIsNone(cover_url({}))

        self.assertIn("t_720p/img999.jpg", image_url("img999", "t_720p") or "")
        self.assertIsNone(image_url(None))
        self.assertIsNone(image_url(""))

    def test_game_type_label_mapping(self) -> None:
        self.assertEqual(game_type_label({"game_type": 0}), "main_game")
        self.assertEqual(game_type_label({"game_type": 1}), "dlc_addon")
        self.assertEqual(game_type_label({"game_type": 2}), "expansion")
        self.assertEqual(game_type_label({"category": "custom_label"}), "custom_label")
        self.assertIsNone(game_type_label({}))
