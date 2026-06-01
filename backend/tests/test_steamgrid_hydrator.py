"""Tests for SteamGridDB artwork selection."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from otix.domain.media import Game, MediaItem
from otix.providers.steamgrid.hydrator import SteamGridDBHydrator


def _hydrator() -> SteamGridDBHydrator:
    provider = AsyncMock()
    session = AsyncMock()
    return SteamGridDBHydrator(provider, session)


class TestPickHero:
    def test_prefers_material_over_higher_scored_blurred(self):
        hero = _hydrator()._pick_hero([
            {"url": "https://img/blurred.jpg", "style": "blurred", "score": 100},
            {"url": "https://img/material.jpg", "style": "material", "score": 1},
        ])

        assert hero is not None
        assert hero["url"] == "https://img/material.jpg"

    def test_uses_highest_score_within_same_text_safe_style(self):
        hero = _hydrator()._pick_hero([
            {"url": "https://img/low.jpg", "style": "material", "score": 2},
            {"url": "https://img/high.jpg", "style": "material", "score": 8},
        ])

        assert hero is not None
        assert hero["url"] == "https://img/high.jpg"

    def test_does_not_fall_back_to_alternate_heroes(self):
        hero = _hydrator()._pick_hero([
            {"url": "https://img/alternate.jpg", "style": "alternate", "score": 999},
        ])

        assert hero is None


async def test_fetch_assets_requests_full_asset_sets():
    provider = AsyncMock()
    provider.get_grids.return_value = []
    provider.get_heroes.return_value = []
    provider.get_logos.return_value = []
    provider.get_icons.return_value = []

    hydrator = SteamGridDBHydrator(provider, AsyncMock())
    await hydrator._fetch_assets(123)

    provider.get_grids.assert_awaited_once_with(123)
    provider.get_heroes.assert_awaited_once_with(123)
    provider.get_logos.assert_awaited_once_with(123)
    provider.get_icons.assert_awaited_once_with(123)


async def test_hydrate_promotes_text_safe_hero_over_existing_backdrop():
    provider = AsyncMock()
    provider.get_game_by_platform_id.return_value = {"id": 123}
    provider.get_grids.return_value = []
    provider.get_heroes.return_value = [
        {"url": "https://img/text-safe.jpg", "style": "material", "score": 4},
    ]
    provider.get_logos.return_value = []
    provider.get_icons.return_value = []

    media_item = MediaItem(
        media_type="game",
        title="Test Game",
        slug="test-game",
        backdrop_url="https://images.igdb.com/igdb/image/upload/t_1080p/texty.jpg",
    )
    media_item.id = "oti_test00000001"
    game = Game(media_item_id=media_item.id, steam_app_id=730)

    scalars_result = MagicMock()
    scalars_result.all.return_value = []
    session = MagicMock()
    session.get = AsyncMock(return_value=media_item)
    session.scalar = AsyncMock(return_value=None)
    session.scalars = AsyncMock(return_value=scalars_result)

    added = await SteamGridDBHydrator(provider, session).hydrate(
        game,
        platform="steam",
        platform_id=730,
    )

    assert added == 1
    assert media_item.backdrop_url == "https://img/text-safe.jpg"


async def test_hydrate_stores_all_assets_but_only_promotes_text_safe_hero():
    provider = AsyncMock()
    provider.get_game_by_platform_id.return_value = {"id": 123}
    provider.get_grids.return_value = [
        {"url": "https://img/no-logo-grid.jpg", "style": "no_logo", "score": 5},
        {"url": "https://img/alternate-grid.jpg", "style": "alternate", "score": 99},
    ]
    provider.get_heroes.return_value = [
        {"url": "https://img/text-hero.jpg", "style": "alternate", "score": 100},
        {"url": "https://img/clean-hero.jpg", "style": "material", "score": 1},
    ]
    provider.get_logos.return_value = [
        {"url": "https://img/logo.png", "style": "official", "score": 3},
    ]
    provider.get_icons.return_value = [
        {"url": "https://img/icon.ico", "score": 2},
    ]

    media_item = MediaItem(media_type="game", title="Test Game", slug="test-game")
    media_item.id = "oti_test00000001"
    game = Game(media_item_id=media_item.id, steam_app_id=730)

    scalars_result = MagicMock()
    scalars_result.all.return_value = []
    session = MagicMock()
    session.get = AsyncMock(return_value=media_item)
    session.scalar = AsyncMock(return_value=None)
    session.scalars = AsyncMock(return_value=scalars_result)

    added = await SteamGridDBHydrator(provider, session).hydrate(
        game,
        platform="steam",
        platform_id=730,
    )

    assert added == 6
    assert media_item.backdrop_url == "https://img/clean-hero.jpg"
    assert media_item.textless_poster_url == "https://img/no-logo-grid.jpg"
    assert media_item.logo_url == "https://img/logo.png"

    stored = {call.args[0].url: call.args[0].asset_type for call in session.add.call_args_list}
    assert stored == {
        "https://img/no-logo-grid.jpg": "textless_poster",
        "https://img/alternate-grid.jpg": "poster",
        "https://img/text-hero.jpg": "backdrop",
        "https://img/clean-hero.jpg": "backdrop",
        "https://img/logo.png": "logo",
        "https://img/icon.ico": "icon",
    }
