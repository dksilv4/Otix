"""Tests for IGDB provider — transformer and hydrator."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock

import pytest

from otix.domain.asset import ExternalRating, MediaAsset, MediaVideo
from otix.domain.genre import Genre
from otix.domain.media import ExternalID, Game
from otix.providers.igdb.client import IGDBProvider
from otix.providers.igdb.hydrator import IGDBHydrator
from otix.providers.igdb.transformer import (
    _cover_url,
    _extract_modes,
    _extract_platforms,
    _extract_steam_app_id,
    _extract_website,
    _parse_timestamp,
    _slugify,
    to_game,
    to_media_item,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def igdb_game_raw() -> dict:
    return {
        "id": 1942,
        "name": "The Witcher 3: Wild Hunt",
        "summary": "RPG set in a fantasy open world.",
        "storyline": "Geralt searches for Ciri.",
        "first_release_date": 1432857600,  # 2015-05-29
        "rating": 88.5,
        "aggregated_rating": 92.3,
        "rating_count": 4500,
        "aggregated_rating_count": 180,
        "hypes": 150,
        "url": "https://www.igdb.com/games/the-witcher-3-wild-hunt",
        "slug": "the-witcher-3-wild-hunt",
        "version_title": "",
        "status": 0,
        "game_type": 0,
        "cover": {"image_id": "co1tj2"},
        "screenshots": [
            {"image_id": "sc1"},
            {"image_id": "sc2"},
        ],
        "artworks": [
            {"image_id": "ar1"},
            {"image_id": "ar2"},
            {"image_id": "ar3"},
        ],
        "genres": [
            {"name": "Role-playing (RPG)"},
            {"name": "Adventure"},
        ],
        "themes": [
            {"name": "Fantasy"},
            {"name": "Open world"},
        ],
        "platforms": [
            {"name": "PC (Microsoft Windows)", "platform_logo": {"image_id": "pl1"}},
            {"name": "PlayStation 4"},
        ],
        "game_modes": [
            {"name": "Single player"},
        ],
        "websites": [
            {"url": "https://thewitcher.com", "category": 1},
            {"url": "https://steamcommunity.com/app/292030", "category": 13},
        ],
        "videos": [
            {"video_id": "cGd3vjRjDnM", "name": "Launch Trailer"},
        ],
    }


@pytest.fixture
def igdb_minimal_raw() -> dict:
    """Game with minimal fields — no genres, no cover, no release date."""
    return {
        "id": 9999,
        "name": "Untitled Game",
        "summary": "A mystery.",
        "first_release_date": None,
        "rating": None,
        "aggregated_rating": None,
        "hypes": 0,
        "status": None,
    }


@pytest.fixture
def mock_provider():
    return AsyncMock(spec=IGDBProvider)


@pytest.fixture
def igdb_hydrator(mock_provider, mock_db_session: AsyncMock) -> IGDBHydrator:
    return IGDBHydrator(mock_provider, mock_db_session)


# ═══════════════════════════════════════════════════════════════════════════════
# Transformer tests — helper functions
# ═══════════════════════════════════════════════════════════════════════════════


class TestParseTimestamp:
    def test_valid_timestamp(self):
        ts = 1432857600  # 2015-05-29
        result = _parse_timestamp(ts)
        assert result == date(2015, 5, 29)

    def test_none(self):
        assert _parse_timestamp(None) is None

    def test_zero_is_valid_date(self):
        """Timestamp 0 = 1970-01-01, should not be treated as missing."""
        result = _parse_timestamp(0)
        assert result == date(1970, 1, 1)


class TestCoverUrl:
    def test_valid_image_id(self):
        url = _cover_url("co1tj2")
        assert url == "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tj2.jpg"

    def test_none(self):
        assert _cover_url(None) is None

    def test_empty_string(self):
        assert _cover_url("") is None

    def test_custom_size(self):
        url = _cover_url("co1tj2", "t_screenshot_big")
        assert "t_screenshot_big" in url


class TestSlugify:
    def test_basic_title(self):
        assert _slugify("The Witcher 3: Wild Hunt") == "the-witcher-3-wild-hunt"

    def test_special_chars(self):
        assert _slugify("Hello! World?") == "hello-world"

    def test_underscores_to_hyphens(self):
        assert _slugify("Super_Mario_World") == "super-mario-world"


class TestExtractPlatforms:
    def test_extracts_with_logos(self):
        platforms = [
            {"name": "PC (Microsoft Windows)", "platform_logo": {"image_id": "pl1"}},
            {"name": "PlayStation 4"},
        ]
        result = _extract_platforms(platforms)
        assert result is not None
        assert "pc-microsoft-windows" in result
        assert result["pc-microsoft-windows"]["logo_image_id"] == "pl1"
        assert "playstation-4" in result
        assert "logo_image_id" not in result["playstation-4"]

    def test_empty_list(self):
        assert _extract_platforms([]) is None

    def test_skips_invalid_entries(self):
        platforms = [{"no_name": "x"}, {"name": "Valid"}]
        result = _extract_platforms(platforms)
        assert result is not None
        assert "valid" in result
        assert len(result) == 1


class TestExtractModes:
    def test_extracts_modes(self):
        modes = [{"name": "Single player"}, {"name": "Multiplayer"}]
        result = _extract_modes(modes)
        assert result is not None
        assert "single-player" in result
        assert "multiplayer" in result

    def test_empty(self):
        assert _extract_modes([]) is None


class TestExtractWebsite:
    def test_prefers_official(self):
        websites = [
            {"url": "https://fandom.com", "category": 2},
            {"url": "https://official.com", "category": 1},
        ]
        assert _extract_website(websites) == "https://official.com"

    def test_fallback_to_first(self):
        websites = [
            {"url": "https://first.com", "category": 13},
            {"url": "https://second.com", "category": 13},
        ]
        assert _extract_website(websites) == "https://first.com"

    def test_empty(self):
        assert _extract_website([]) is None


class TestExtractSteamAppID:
    def test_extracts_from_store_url(self):
        websites = [{"url": "https://store.steampowered.com/app/292030/", "category": 13}]
        assert _extract_steam_app_id(websites) == 292030

    def test_extracts_from_community_url(self):
        websites = [{"url": "https://steamcommunity.com/app/730", "category": 13}]
        assert _extract_steam_app_id(websites) == 730

    def test_skips_non_steam_categories(self):
        websites = [
            {"url": "https://store.steampowered.com/app/123/", "category": 1},
            {"url": "https://example.com", "category": 13},
        ]
        assert _extract_steam_app_id(websites) is None

    def test_empty(self):
        assert _extract_steam_app_id([]) is None

    def test_no_match_in_url(self):
        websites = [{"url": "https://steamcommunity.com/games/123", "category": 13}]
        assert _extract_steam_app_id(websites) is None


# ═══════════════════════════════════════════════════════════════════════════════
# Transformer tests — to_media_item / to_game
# ═══════════════════════════════════════════════════════════════════════════════


class TestToMediaItem:
    def test_basic_fields(self, igdb_game_raw):
        item = to_media_item(igdb_game_raw)
        assert item.media_type == "game"
        assert item.title == "The Witcher 3: Wild Hunt"
        assert item.overview == "Geralt searches for Ciri."  # storyline preferred over summary
        assert item.slug == "the-witcher-3-wild-hunt"
        assert item.release_date == date(2015, 5, 29)
        assert item.popularity == 150.0
        assert item.poster_url == "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tj2.jpg"
        assert item.backdrop_url is not None
        assert "t_1080p" in item.backdrop_url
        assert "ar1" in item.backdrop_url  # first artwork

    def test_minimal_game(self, igdb_minimal_raw):
        item = to_media_item(igdb_minimal_raw)
        assert item.media_type == "game"
        assert item.title == "Untitled Game"
        assert item.overview == "A mystery."
        assert item.release_date is None
        assert item.popularity == 0.0
        assert item.poster_url is None
        assert item.backdrop_url is None

    def test_generates_slug_if_missing(self, igdb_minimal_raw):
        igdb_minimal_raw["slug"] = None
        item = to_media_item(igdb_minimal_raw)
        assert item.slug == "untitled-game"

    def test_no_cover_dict(self, igdb_minimal_raw):
        item = to_media_item(igdb_minimal_raw)
        assert item.poster_url is None
        assert item.backdrop_url is None


class TestToGame:
    def test_full_game(self, igdb_game_raw):
        game = to_game(igdb_game_raw)
        assert game.release_status == "released"
        assert game.website == "https://thewitcher.com"
        assert game.steam_app_id == 292030
        assert game.platforms is not None
        assert "pc-microsoft-windows" in game.platforms
        assert game.modes is not None
        assert "single-player" in game.modes
        assert game.has_multiplayer is False
        assert game.media_item is not None
        assert game.media_item.title == "The Witcher 3: Wild Hunt"

    def test_status_mapping(self, igdb_game_raw):
        statuses = {0: "released", 2: "alpha", 3: "beta", 4: "early_access", 5: "offline", 6: "cancelled"}
        for code, label in statuses.items():
            igdb_game_raw["status"] = code
            game = to_game(igdb_game_raw)
            assert game.release_status == label, f"status {code} should map to {label}"

    def test_unknown_status(self, igdb_game_raw):
        igdb_game_raw["status"] = 99
        game = to_game(igdb_game_raw)
        assert game.release_status is None

    def test_has_multiplayer(self, igdb_game_raw):
        igdb_game_raw["game_modes"] = [
            {"name": "Single player"},
            {"name": "Multiplayer"},
            {"name": "Co-operative"},
        ]
        game = to_game(igdb_game_raw)
        assert game.has_multiplayer is True

    def test_minimal_game(self, igdb_minimal_raw):
        game = to_game(igdb_minimal_raw)
        assert game.media_item.title == "Untitled Game"
        assert game.release_status is None
        assert game.website is None
        assert game.platforms is None
        assert game.modes is None
        assert game.has_multiplayer is False


# ═══════════════════════════════════════════════════════════════════════════════
# Hydrator tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestHydrateExternalID:
    async def test_creates_new_external_id(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        mock_db_session.scalar.return_value = None
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_external_id(item, igdb_game_raw)

        mock_db_session.add.assert_called_once()
        added = mock_db_session.add.call_args[0][0]
        assert isinstance(added, ExternalID)
        assert added.provider == "igdb"
        assert added.external_id == "1942"

    async def test_skips_existing(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        existing = ExternalID(provider="igdb", external_id="1942")
        mock_db_session.scalar.return_value = existing
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_external_id(item, igdb_game_raw)
        mock_db_session.add.assert_not_called()


class TestHydrateGenres:
    async def test_extracts_genres_and_themes(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        mock_db_session.scalars.return_value = []
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_genres(item, igdb_game_raw)

        # Should clear existing links
        mock_db_session.execute.assert_called_once()

        # Should add new genres and MediaGenre links
        genre_adds = [
            g for call in mock_db_session.add_all.call_args_list
            for g in call[0][0] if isinstance(g, Genre)
        ]
        assert len(genre_adds) == 4  # 2 genres + 2 themes

    async def test_skips_existing_genres(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        existing_genre = Genre(name="Role-playing (RPG)", slug="role-playing-rpg")
        mock_db_session.scalars.return_value = [existing_genre]
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_genres(item, igdb_game_raw)

        genre_adds = [
            g for call in mock_db_session.add_all.call_args_list
            for g in call[0][0] if isinstance(g, Genre)
        ]
        slugs = {g.slug for g in genre_adds}
        assert "role-playing-rpg" not in slugs

    async def test_empty_genres(self, igdb_hydrator, mock_db_session, igdb_minimal_raw):
        item = to_media_item(igdb_minimal_raw)

        await igdb_hydrator.hydrate_genres(item, igdb_minimal_raw)
        mock_db_session.add.assert_not_called()


class TestHydrateImages:
    async def test_creates_cover_screenshots_artworks(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        mock_db_session.scalars.return_value = []
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_images(item, igdb_game_raw)

        assets_added = [
            c[0][0] for c in mock_db_session.add.call_args_list
            if isinstance(c[0][0], MediaAsset)
        ]
        types = {a.asset_type for a in assets_added}
        assert "cover" in types
        assert "screenshot" in types
        assert "artwork" in types

    async def test_skips_existing_urls(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        existing_url = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tj2.jpg"
        mock_db_session.scalars.return_value = [existing_url]
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_images(item, igdb_game_raw)

        assets_added = [
            c[0][0] for c in mock_db_session.add.call_args_list
            if isinstance(c[0][0], MediaAsset)
        ]
        types = {a.asset_type for a in assets_added}
        assert "cover" not in types

    async def test_no_images(self, igdb_hydrator, mock_db_session, igdb_minimal_raw):
        item = to_media_item(igdb_minimal_raw)

        await igdb_hydrator.hydrate_images(item, igdb_minimal_raw)
        mock_db_session.add.assert_not_called()


class TestHydrateVideos:
    async def test_creates_video(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_videos(item, igdb_game_raw)

        videos_added = [
            c[0][0] for c in mock_db_session.add.call_args_list
            if isinstance(c[0][0], MediaVideo)
        ]
        assert len(videos_added) == 1
        v = videos_added[0]
        assert v.url == "https://www.youtube.com/watch?v=cGd3vjRjDnM"
        assert v.provider == "igdb"

    async def test_no_videos(self, igdb_hydrator, mock_db_session, igdb_minimal_raw):
        item = to_media_item(igdb_minimal_raw)

        await igdb_hydrator.hydrate_videos(item, igdb_minimal_raw)
        mock_db_session.add.assert_not_called()


class TestHydrateRatings:
    async def test_creates_critic_and_user_ratings(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        mock_db_session.scalars.return_value = []
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_ratings(item, igdb_game_raw)

        ratings_added = [
            c[0][0] for c in mock_db_session.add.call_args_list
            if isinstance(c[0][0], ExternalRating)
        ]
        providers = {r.provider for r in ratings_added}
        assert "igdb_critic" in providers
        assert "igdb_user" in providers

        critic = next(r for r in ratings_added if r.provider == "igdb_critic")
        assert critic.score == 92.3
        assert critic.max_score == 100.0
        assert critic.vote_count == 180

        user = next(r for r in ratings_added if r.provider == "igdb_user")
        assert user.score == 88.5
        assert user.vote_count == 4500

    async def test_updates_existing_ratings(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        existing = ExternalRating(
            media_item_id="test_id",
            provider="igdb_critic",
            score=80.0,
            max_score=100.0,
            vote_count=100,
        )
        mock_db_session.scalars.return_value = [existing]
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_ratings(item, igdb_game_raw)

        assert existing.score == 92.3
        assert existing.vote_count == 180

    async def test_no_ratings(self, igdb_hydrator, mock_db_session, igdb_minimal_raw):
        item = to_media_item(igdb_minimal_raw)

        await igdb_hydrator.hydrate_ratings(item, igdb_minimal_raw)
        mock_db_session.add.assert_not_called()


class TestHydrateAll:
    async def test_runs_all_steps(self, igdb_hydrator, mock_db_session, igdb_game_raw):
        mock_db_session.scalars.return_value = []
        mock_db_session.scalar.return_value = None
        item = to_media_item(igdb_game_raw)

        await igdb_hydrator.hydrate_all(item, igdb_game_raw)

        # ExternalID, videos, ratings should all have been added
        added_types = {
            type(c[0][0]).__name__
            for c in mock_db_session.add.call_args_list
            if c[0]
        }
        assert "ExternalID" in added_types
        assert "MediaVideo" in added_types
        assert "ExternalRating" in added_types
