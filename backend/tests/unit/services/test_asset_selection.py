"""Tests for query-time asset selection (otix.services.asset_selection)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from otix.domain.asset import MediaAsset
from otix.domain.media import MediaItem
from otix.services.asset_selection import (
    _resolve_from_db,
    _select_best,
    enrich_items_with_assets,
    resolve_assets,
    resolved_assets_view,
)


def make_asset(
    asset_type: str,
    url: str,
    *,
    label: str | None = None,
    score: int | None = None,
    width: int | None = None,
    item_id: str = "mi_1",
) -> MediaAsset:
    a = MediaAsset(media_item_id=item_id, asset_type=asset_type, url=url)
    a.label = label
    a.score = score
    a.width = width
    return a


class TestSelectBest:
    def test_logo_prefers_multicolor_over_black(self):
        best = _select_best(
            [
                make_asset("logo", "https://img/black.png", label="black", score=99),
                make_asset("logo", "https://img/multi.png", label="multicolor", score=1),
            ],
            "logo",
        )
        assert best is not None
        assert best.url == "https://img/multi.png"

    def test_logo_prefers_official_equal_to_multicolor(self):
        best = _select_best(
            [
                make_asset("logo", "https://img/multi.png", label="multicolor", score=5),
                make_asset("logo", "https://img/official.png", label="official", score=8),
            ],
            "logo",
        )
        # multicolor and official tie on preference; higher score wins.
        assert best.url == "https://img/official.png"

    def test_backdrop_excludes_alternate_even_with_max_score(self):
        best = _select_best(
            [
                make_asset("backdrop", "https://img/alt.jpg", label="alternate", score=999),
                make_asset("backdrop", "https://img/blurred.jpg", label="blurred", score=1),
            ],
            "backdrop",
        )
        assert best is not None
        assert best.url == "https://img/blurred.jpg"

    def test_backdrop_prefers_material_over_blurred(self):
        best = _select_best(
            [
                make_asset("backdrop", "https://img/blur.jpg", label="blurred", score=50),
                make_asset("backdrop", "https://img/mat.jpg", label="material", score=1),
            ],
            "backdrop",
        )
        assert best.url == "https://img/mat.jpg"

    def test_poster_prefers_textless_over_official(self):
        best = _select_best(
            [
                make_asset("poster", "https://img/off.jpg", label="official", score=90),
                make_asset("poster", "https://img/tl.jpg", label="textless", score=1),
            ],
            "poster",
        )
        assert best.url == "https://img/tl.jpg"

    def test_poster_prefers_alternate_over_official(self):
        best = _select_best(
            [
                make_asset("poster", "https://img/off.jpg", label="official", score=90),
                make_asset("poster", "https://img/alt.jpg", label="alternate", score=1),
            ],
            "poster",
        )
        assert best.url == "https://img/alt.jpg"

    def test_icon_prefers_official_and_png_bonus(self):
        best = _select_best(
            [
                make_asset("icon", "https://img/custom.jpg", label="custom", score=10),
                make_asset("icon", "https://img/off.png", label="official", score=2),
            ],
            "icon",
        )
        assert best.url == "https://img/off.png"

    def test_icon_png_bonus_beats_higher_score_jpg(self):
        best = _select_best(
            [
                make_asset("icon", "https://img/off.jpg", label="official", score=10),
                make_asset("icon", "https://img/off.png", label="official", score=5),
            ],
            "icon",
        )
        assert best.url == "https://img/off.png"

    def test_textless_prefers_textless_label(self):
        best = _select_best(
            [
                make_asset("textless_poster", "https://img/mat.jpg", label="material", score=99),
                make_asset("textless_poster", "https://img/tl.jpg", label="textless", score=1),
            ],
            "textless_poster",
        )
        assert best.url == "https://img/tl.jpg"

    def test_uses_score_within_same_label(self):
        best = _select_best(
            [
                make_asset("logo", "https://img/low.png", label="white", score=2),
                make_asset("logo", "https://img/high.png", label="white", score=8),
            ],
            "logo",
        )
        assert best.url == "https://img/high.png"

    def test_uses_width_when_score_ties(self):
        best = _select_best(
            [
                make_asset("poster", "https://img/wide.jpg", label="official", score=5, width=1920),
                make_asset("poster", "https://img/narrow.jpg", label="official", score=5, width=300),
            ],
            "poster",
        )
        assert best.url == "https://img/wide.jpg"

    def test_returns_none_for_empty(self):
        assert _select_best([], "poster") is None


class TestResolveFromDb:
    async def test_groups_and_ranks_per_item_type(self):
        rows = [
            make_asset("poster", "https://img/mi1-official.jpg", label="official", score=99, item_id="mi_1"),
            make_asset("poster", "https://img/mi1-textless.jpg", label="textless", score=1, item_id="mi_1"),
            make_asset("poster", "https://img/mi2.jpg", label="official", score=5, item_id="mi_2"),
            make_asset("logo", "https://img/mi1-logo.png", label="multicolor", score=3, item_id="mi_1"),
        ]
        session = MagicMock()
        session.scalars = AsyncMock(return_value=rows)

        out = await _resolve_from_db(session, ["mi_1", "mi_2"], ("poster", "logo"))

        assert out["mi_1"]["poster_url"] == "https://img/mi1-textless.jpg"
        assert out["mi_1"]["logo_url"] == "https://img/mi1-logo.png"
        assert out["mi_2"]["poster_url"] == "https://img/mi2.jpg"
        assert out["mi_2"]["logo_url"] is None

    async def test_no_items_returns_empty(self):
        session = AsyncMock()
        assert await _resolve_from_db(session, [], ("poster",)) == {}


class TestResolveAssets:
    async def test_admin_override_wins_over_cached(self):
        override_rows = [
            MagicMock(media_item_id="mi_1", image_type="logo", url="https://img/admin.png"),
        ]
        asset_rows = [
            make_asset("logo", "https://img/auto.png", label="multicolor", score=99, item_id="mi_1"),
        ]
        session = MagicMock()
        session.scalars = AsyncMock(side_effect=[override_rows, asset_rows])

        redis = AsyncMock()
        redis.mget.return_value = [
            '{"poster_url": "https://img/cached.png", "logo_url": "https://img/cached-logo.png"}'
        ]

        out = await resolve_assets(session, redis, ["mi_1"], ("poster", "logo"))

        assert out["mi_1"]["logo_url"] == "https://img/admin.png"
        assert out["mi_1"]["poster_url"] == "https://img/cached.png"

    async def test_cache_hit_skips_db(self):
        session = MagicMock()
        session.scalars = AsyncMock(return_value=[])
        redis = AsyncMock()
        redis.mget.return_value = ['{"poster_url": "https://img/cached.jpg", "logo_url": null}']

        out = await resolve_assets(session, redis, ["mi_1"], ("poster", "logo"))

        assert out["mi_1"]["poster_url"] == "https://img/cached.jpg"
        assert out["mi_1"]["logo_url"] is None
        # Only the admin-override query runs; the ranked-DB path is skipped.
        assert session.scalars.await_count == 1

    async def test_cache_miss_ranks_db_and_writes_cache(self):
        rows = [
            make_asset("logo", "https://img/best.png", label="multicolor", score=7, item_id="mi_1"),
            make_asset("logo", "https://img/meh.png", label="black", score=99, item_id="mi_1"),
        ]
        session = MagicMock()
        session.scalars = AsyncMock(side_effect=[[], rows])

        redis = AsyncMock()
        redis.mget.return_value = [None]

        out = await resolve_assets(session, redis, ["mi_1"], ("logo",))

        assert out["mi_1"]["logo_url"] == "https://img/best.png"
        redis.setex.assert_awaited_once()

    async def test_empty_items_returns_empty(self):
        session = AsyncMock()
        redis = AsyncMock()
        assert await resolve_assets(session, redis, [], ("poster",)) == {}


class TestResolvedAssetsView:
    def test_returns_object_when_no_resolved_urls(self):
        item = MediaItem(media_type="movie", title="Fight Club", slug="fight-club")
        assert resolved_assets_view(item, ("poster_url", "screenshots")) is item

    def test_missing_attributes_stay_absent_for_schema_defaults(self):
        item = MediaItem(media_type="movie", title="Fight Club", slug="fight-club")
        item.id = "mi_1"
        item._resolved_poster_url = "https://img/p.jpg"
        # MediaItem has no ``screenshots`` attribute — it must not appear in the
        # dict as None, or Pydantic's `screenshots: list = []` default is
        # overridden and validation fails.
        out = resolved_assets_view(item, ("poster_url", "screenshots", "title"))
        assert out["poster_url"] == "https://img/p.jpg"
        assert out["title"] == "Fight Club"
        assert "screenshots" not in out

    def test_includes_other_existing_attributes(self):
        item = MediaItem(media_type="game", title="Witcher", slug="witcher")
        item._resolved_logo_url = "https://img/logo.png"
        out = resolved_assets_view(item, ("logo_url", "title", "overview"))
        assert out["logo_url"] == "https://img/logo.png"
        assert out["title"] == "Witcher"


class TestEnrich:
    async def test_attaches_resolved_urls(self):
        item = MediaItem(media_type="movie", title="Fight Club", slug="fight-club")
        item.id = "mi_1"

        rows = [make_asset("poster", "https://img/p.jpg", label="official", score=5, item_id="mi_1")]
        session = MagicMock()
        session.scalars = AsyncMock(side_effect=[[], rows])

        redis = AsyncMock()
        redis.mget.return_value = [None]

        await enrich_items_with_assets(session, [item], redis=redis)

        assert item._resolved_poster_url == "https://img/p.jpg"
        assert item._resolved_logo_url is None
        assert item._resolved_backdrop_url is None

    async def test_empty_items_noop(self):
        session = AsyncMock()
        assert await enrich_items_with_assets(session, [], redis=AsyncMock()) == []
