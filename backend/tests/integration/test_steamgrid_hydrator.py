"""Tests for SteamGridDB artwork selection."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from otix.domain.media import Game, MediaItem
from otix.providers.asset_pipeline import AssetPipeline, RawAsset, rank_hero_by_style
from otix.providers.steamgrid.hydrator import SteamGridDBHydrator


class TestPickHero:
    def test_prefers_material_over_higher_scored_blurred(self):
        hero = rank_hero_by_style([
            RawAsset(asset_type="backdrop", url="https://img/blurred.jpg", style="blurred", score=100, provider="steamgrid"),
            RawAsset(asset_type="backdrop", url="https://img/material.jpg", style="material", score=1, provider="steamgrid"),
        ])

        assert hero is not None
        assert hero.url == "https://img/material.jpg"

    def test_uses_highest_score_within_same_text_safe_style(self):
        hero = rank_hero_by_style([
            RawAsset(asset_type="backdrop", url="https://img/low.jpg", style="material", score=2, provider="steamgrid"),
            RawAsset(asset_type="backdrop", url="https://img/high.jpg", style="material", score=8, provider="steamgrid"),
        ])

        assert hero is not None
        assert hero.url == "https://img/high.jpg"

    def test_does_not_fall_back_to_alternate_heroes(self):
        hero = rank_hero_by_style([
            RawAsset(asset_type="backdrop", url="https://img/alternate.jpg", style="alternate", score=999, provider="steamgrid"),
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


async def test_hydrate_stores_all_assets_with_types_and_labels():
    provider = AsyncMock()
    provider.get_game_by_platform_id.return_value = {"id": 123}
    provider.get_grids.return_value = [
        {"url": "https://img/no-logo-grid.jpg", "style": "no_logo", "score": 5},
        {"url": "https://img/alternate-grid.jpg", "style": "alternate", "score": 99},
    ]
    provider.get_heroes.return_value = [
        {"url": "https://img/alternate-hero.jpg", "style": "alternate", "score": 100},
        {"url": "https://img/material-hero.jpg", "style": "material", "score": 1},
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
    session.execute = AsyncMock()

    stored_batches: list[list[RawAsset]] = []
    counts = [2, 2, 1, 1]

    async def fake_store(_self: object, _media_item_id: str, assets: list[RawAsset]) -> int:
        stored_batches.append(list(assets))
        return counts.pop(0)

    promote_mock = AsyncMock()
    with patch.object(AssetPipeline, "store", fake_store), patch.object(
        AssetPipeline, "promote_all", promote_mock
    ):
        added = await SteamGridDBHydrator(provider, session).hydrate(
            game,
            platform="steam",
            platform_id=730,
        )

    assert added == 6

    by_type: dict[str, list[tuple[str, str | None]]] = {}
    for batch in stored_batches:
        for a in batch:
            by_type.setdefault(a.asset_type, []).append((a.url, a.label))

    assert by_type["textless_poster"] == [("https://img/no-logo-grid.jpg", "textless")]
    assert by_type["poster"] == [("https://img/alternate-grid.jpg", "alternate")]
    assert by_type["backdrop"] == [
        ("https://img/alternate-hero.jpg", "alternate"),
        ("https://img/material-hero.jpg", "material"),
    ]
    assert by_type["logo"] == [("https://img/logo.png", "multicolor")]
    assert by_type["icon"] == [("https://img/icon.ico", None)]

    promote_mock.assert_awaited_once()
    _, asset_map = promote_mock.await_args.args
    assert set(asset_map) == {"textless_poster", "logo", "icon", "backdrop"}
    backdrop_raw = asset_map["backdrop"]
    assert any(a.url == "https://img/material-hero.jpg" for a in backdrop_raw)
