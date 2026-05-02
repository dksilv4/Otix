"""Tests for Steam provider — transformer, client, and hydrator."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.asset import ExternalRating, MediaAsset, MediaVideo
from otix.domain.company import Company, InvolvedCompany
from otix.domain.media import Game, MediaItem
from otix.lib.slug import slugify
from otix.providers.steam.client import SteamError, SteamProvider
from otix.providers.steam.hydrator import SteamHydrator
from otix.providers.steam.transformer import (
    extract_developers,
    extract_metacritic,
    extract_movie_data,
    extract_price,
    extract_publishers,
    extract_recommendations,
    extract_review_score,
    extract_review_summary,
    extract_screenshot_urls,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def steam_store_raw() -> dict:
    return {
        "steam_appid": 730,
        "name": "Counter-Strike 2",
        "is_free": True,
        "developers": ["Valve"],
        "publishers": ["Valve"],
        "price_overview": {
            "currency": "USD",
            "initial": 0,
            "final": 0,
            "discount_percent": 0,
        },
        "recommendations": {"total": 8000000},
        "review_summary": "Very Positive",
        "review_score": 88,
        "total_reviews": 7500000,
        "metacritic": {"score": 88, "url": "https://www.metacritic.com/game/pc/counter-strike-2"},
        "screenshots": [
            {"id": 0, "path_thumbnail": "/thumb1.jpg", "path_full": "/full1.jpg"},
            {"id": 1, "path_thumbnail": "/thumb2.jpg", "path_full": "/full2.jpg"},
        ],
        "movies": [
            {
                "id": 1,
                "name": "Launch Trailer",
                "thumbnail": "https://cdn.steamstatic.com/thumb.jpg",
                "webm": {"480": "https://cdn.steamstatic.com/movie480.webm", "max": "https://cdn.steamstatic.com/movie_max.webm"},
            },
        ],
    }


@pytest.fixture
def steam_store_minimal() -> dict:
    """Minimal store data — no optional fields."""
    return {
        "steam_appid": 9999,
        "name": "Minimal Game",
        "is_free": False,
    }


@pytest.fixture
def steam_hydrator(mock_db_session: AsyncMock) -> SteamHydrator:
    provider = MagicMock(spec=SteamProvider)
    return SteamHydrator(provider, mock_db_session)


@pytest.fixture
def sample_game() -> Game:
    item = MediaItem(media_type="game", title="Test Game", slug="test-game")
    item.id = "oti_test00000001"
    game = Game(media_item_id=item.id, steam_app_id=730)
    game.media_item = item
    return game


# ═══════════════════════════════════════════════════════════════════════════════
# Transformer tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestExtractDevelopers:
    def test_extracts_developers(self, steam_store_raw):
        assert extract_developers(steam_store_raw) == ["Valve"]

    def test_multiple_developers(self):
        data = {"developers": ["Valve", "Hidden Path Entertainment"]}
        assert extract_developers(data) == ["Valve", "Hidden Path Entertainment"]

    def test_missing_key(self):
        assert extract_developers({}) is None

    def test_empty_list(self):
        assert extract_developers({"developers": []}) is None

    def test_not_a_list(self):
        assert extract_developers({"developers": "Valve"}) is None

    def test_filters_empty_strings(self):
        data = {"developers": ["Valve", "", "Hidden Path"]}
        assert extract_developers(data) == ["Valve", "Hidden Path"]


class TestExtractPublishers:
    def test_extracts_publishers(self, steam_store_raw):
        assert extract_publishers(steam_store_raw) == ["Valve"]

    def test_missing_key(self):
        assert extract_publishers({}) is None

    def test_empty_list(self):
        assert extract_publishers({"publishers": []}) is None


class TestExtractPrice:
    def test_extracts_price_overview(self, steam_store_raw):
        result = extract_price(steam_store_raw)
        assert result == {"currency": "USD", "initial": 0, "final": 0, "discount_percent": 0}

    def test_discounted_price(self):
        data = {"price_overview": {"currency": "EUR", "initial": 5999, "final": 2999, "discount_percent": 50}}
        result = extract_price(data)
        assert result["initial"] == 5999
        assert result["final"] == 2999
        assert result["discount_percent"] == 50

    def test_missing_key(self):
        assert extract_price({}) is None

    def test_not_a_dict(self):
        assert extract_price({"price_overview": []}) is None


class TestExtractRecommendations:
    def test_extracts_total(self, steam_store_raw):
        assert extract_recommendations(steam_store_raw) == 8000000

    def test_missing_key(self):
        assert extract_recommendations({}) is None

    def test_not_a_dict(self):
        assert extract_recommendations({"recommendations": "many"}) is None


class TestExtractReviewSummary:
    def test_extracts_summary(self, steam_store_raw):
        assert extract_review_summary(steam_store_raw) == "Very Positive"

    def test_missing_key(self):
        assert extract_review_summary({}) is None

    def test_empty_string(self):
        assert extract_review_summary({"review_summary": ""}) is None


class TestExtractReviewScore:
    def test_extracts_score_and_count(self, steam_store_raw):
        result = extract_review_score(steam_store_raw)
        assert result == (88, 7500000)

    def test_missing_keys(self):
        assert extract_review_score({}) is None

    def test_missing_count(self):
        assert extract_review_score({"review_score": 88}) is None

    def test_missing_score(self):
        assert extract_review_score({"total_reviews": 100}) is None


class TestExtractMetacritic:
    def test_extracts_score_and_url(self, steam_store_raw):
        result = extract_metacritic(steam_store_raw)
        assert result == (88, "https://www.metacritic.com/game/pc/counter-strike-2")

    def test_missing_key(self):
        assert extract_metacritic({}) is None

    def test_not_a_dict(self):
        assert extract_metacritic({"metacritic": 88}) is None

    def test_missing_score(self):
        assert extract_metacritic({"metacritic": {"url": "https://..."}}) is None


class TestExtractScreenshotUrls:
    def test_extracts_full_size_urls(self, steam_store_raw):
        result = extract_screenshot_urls(steam_store_raw)
        assert result == ["/full1.jpg", "/full2.jpg"]

    def test_missing_key(self):
        assert extract_screenshot_urls({}) == []

    def test_not_a_list(self):
        assert extract_screenshot_urls({"screenshots": "x"}) == []

    def test_skips_invalid_entries(self):
        data = {"screenshots": [{"path_full": "/ok.jpg"}, {"no_path": "x"}, {"path_full": ""}]}
        assert extract_screenshot_urls(data) == ["/ok.jpg"]


class TestExtractMovieData:
    def test_extracts_movie_with_webm_max(self, steam_store_raw):
        result = extract_movie_data(steam_store_raw)
        assert len(result) == 1
        assert result[0]["name"] == "Launch Trailer"
        assert result[0]["url"] == "https://cdn.steamstatic.com/movie_max.webm"

    def test_falls_back_to_480(self):
        data = {"movies": [{"name": "Trailer", "webm": {"480": "https://cdn/movie480.webm"}}]}
        result = extract_movie_data(data)
        assert result[0]["url"] == "https://cdn/movie480.webm"

    def test_missing_key(self):
        assert extract_movie_data({}) == []

    def test_not_a_list(self):
        assert extract_movie_data({"movies": "x"}) == []

    def test_skips_missing_name(self):
        data = {"movies": [{"webm": {"max": "https://cdn/movie.webm"}}]}
        assert extract_movie_data(data) == []

    def test_skips_missing_url(self):
        data = {"movies": [{"name": "Trailer", "webm": {}}]}
        assert extract_movie_data(data) == []


# ═══════════════════════════════════════════════════════════════════════════════
# Client tests
# ═══════════════════════════════════════════════════════════════════════════════


def _make_mock_response(data: dict, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = data
    return resp


@pytest.fixture
def steam_client(fakeredis):
    """SteamProvider with mocked HTTP transport."""
    import httpx

    from otix.providers.base import BaseProvider

    class MockTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            import json

            if "ISteamUserStats/GetNumberOfCurrentPlayers" in url:
                return httpx.Response(
                    200,
                    content=json.dumps({"response": {"player_count": 12345, "result": 1}}).encode(),
                    request=request,
                )
            elif "api/appdetails" in url:
                params = dict(request.url.params)
                appid = params.get("appids", "")
                if appid == "99999":
                    return httpx.Response(
                        200,
                        content=json.dumps({appid: {"success": False}}).encode(),
                        request=request,
                    )
                return httpx.Response(
                    200,
                    content=json.dumps({
                        appid: {
                            "success": True,
                            "data": {
                                "steam_appid": int(appid),
                                "name": "Test Game",
                                "is_free": False,
                                "developers": ["TestDev"],
                                "publishers": ["TestPub"],
                                "price_overview": {"currency": "USD", "initial": 1999, "final": 999, "discount_percent": 50},
                                "recommendations": {"total": 50000},
                                "review_summary": "Very Positive",
                                "review_score": 92,
                                "total_reviews": 48000,
                                "metacritic": {"score": 90, "url": "https://metacritic.com/test"},
                                "screenshots": [{"path_full": "/ss1.jpg"}],
                                "movies": [{"name": "Trailer", "webm": {"max": "https://cdn/movie.webm"}}],
                            },
                        }
                    }).encode(),
                    request=request,
                )
            elif "api/storesearch" in url:
                params = dict(request.url.params)
                term = params.get("term", "")
                if term == "nonexistent":
                    return httpx.Response(200, content=json.dumps({"items": []}).encode(), request=request)
                return httpx.Response(
                    200,
                    content=json.dumps({
                        "items": [
                            {"id": 730, "name": "Counter-Strike 2"},
                            {"id": 731, "name": "Counter-Strike: Source"},
                        ]
                    }).encode(),
                    request=request,
                )
            return httpx.Response(200, content=b"{}", request=request)

    async def _build():
        import redis.asyncio as aioredis

        r = await fakeredis
        http = httpx.AsyncClient(transport=MockTransport())
        return SteamProvider(r, http)

    return _build


class TestGetCurrentPlayers:
    async def test_returns_player_count(self, steam_client):
        client = await steam_client()
        data = await client.get_current_players(730)
        assert data["response"]["player_count"] == 12345
        assert data["response"]["result"] == 1

    async def test_raises_on_error(self, fakeredis):
        import httpx

        class FailTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(404, content=b"{}", request=request)

        r = await fakeredis
        http = httpx.AsyncClient(transport=FailTransport())
        client = SteamProvider(r, http)
        with pytest.raises(SteamError, match="404"):
            await client.get_current_players(730)


class TestGetAppDetails:
    async def test_returns_app_data(self, steam_client):
        client = await steam_client()
        data = await client.get_app_details(730)
        assert data is not None
        assert data["name"] == "Test Game"
        assert data["developers"] == ["TestDev"]

    async def test_returns_none_for_missing_app(self, steam_client):
        client = await steam_client()
        data = await client.get_app_details(99999)
        assert data is None

    async def test_raises_on_error(self, fakeredis):
        import httpx

        class FailTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(404, content=b"{}", request=request)

        r = await fakeredis
        http = httpx.AsyncClient(transport=FailTransport())
        client = SteamProvider(r, http)
        with pytest.raises(SteamError, match="404"):
            await client.get_app_details(730)


class TestSearchApps:
    async def test_returns_items(self, steam_client):
        client = await steam_client()
        items = await client.search_apps("Counter-Strike")
        assert len(items) == 2
        assert items[0]["id"] == 730

    async def test_returns_empty_for_no_match(self, steam_client):
        client = await steam_client()
        items = await client.search_apps("nonexistent")
        assert items == []

    async def test_raises_on_error(self, fakeredis):
        import httpx

        class FailTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(404, content=b"{}", request=request)

        r = await fakeredis
        http = httpx.AsyncClient(transport=FailTransport())
        client = SteamProvider(r, http)
        with pytest.raises(SteamError, match="404"):
            await client.search_apps("test")


# ═══════════════════════════════════════════════════════════════════════════════
# Hydrator tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestHydrateSkipNoAppID:
    async def test_skips_when_no_steam_app_id(self, steam_hydrator, mock_db_session):
        item = MediaItem(media_type="game", title="Test", slug="test")
        item.id = "oti_test00000001"
        game = Game(media_item_id=item.id, steam_app_id=None)
        game.media_item = item

        await steam_hydrator.hydrate(game)

        steam_hydrator.provider.get_current_players.assert_not_called()
        steam_hydrator.provider.get_app_details.assert_not_called()


class TestHydratePlayerCount:
    async def test_updates_player_count(self, steam_hydrator, sample_game):
        steam_hydrator.provider.get_current_players = AsyncMock(
            return_value={"response": {"player_count": 50000, "result": 1}}
        )

        await steam_hydrator._hydrate_player_count(sample_game, 730)

        assert sample_game.current_players == 50000

    async def test_ignores_non_1_result(self, steam_hydrator, sample_game):
        steam_hydrator.provider.get_current_players = AsyncMock(
            return_value={"response": {"player_count": 100, "result": 42}}
        )

        await steam_hydrator._hydrate_player_count(sample_game, 730)

        assert sample_game.current_players is None

    async def test_handles_error(self, steam_hydrator, sample_game):
        steam_hydrator.provider.get_current_players = AsyncMock(
            side_effect=SteamError("boom")
        )

        await steam_hydrator._hydrate_player_count(sample_game, 730)

        # Should not raise, just skip
        assert sample_game.current_players is None

    async def test_ignores_missing_player_count(self, steam_hydrator, sample_game):
        steam_hydrator.provider.get_current_players = AsyncMock(
            return_value={"response": {"result": 1}}
        )

        await steam_hydrator._hydrate_player_count(sample_game, 730)

        assert sample_game.current_players is None


class TestHydrateStoreData:
    async def test_updates_core_fields(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.provider.get_app_details = AsyncMock(return_value=steam_store_raw)
        mock_db_session = steam_hydrator.session
        mock_db_session.scalar.return_value = None
        mock_db_session.scalars.return_value = []

        await steam_hydrator._hydrate_store_data(sample_game, 730)

        assert sample_game.is_free is True
        assert sample_game.recommendations == 8000000
        assert sample_game.review_summary == "Very Positive"
        assert sample_game.price_json is not None
        assert sample_game.price_json["currency"] == "USD"

        # Companies should be created via _hydrate_companies (uses add_all)
        add_all_calls = mock_db_session.add_all.call_args_list
        all_new = []
        for call in add_all_calls:
            all_new.extend(call[0][0])
        companies = [o for o in all_new if isinstance(o, Company)]
        slugs = {c.slug for c in companies}
        assert slugs == {"valve"}

        add_calls = mock_db_session.add.call_args_list
        involved = [c[0][0] for c in add_calls if isinstance(c[0][0], InvolvedCompany)]
        assert len(involved) == 1
        assert involved[0].developer is True
        assert involved[0].publisher is True

    async def test_handles_store_error(self, steam_hydrator, sample_game):
        steam_hydrator.provider.get_app_details = AsyncMock(side_effect=SteamError("fail"))

        await steam_hydrator._hydrate_store_data(sample_game, 730)

        # Should not raise

    async def test_skips_none_store_data(self, steam_hydrator, sample_game):
        steam_hydrator.provider.get_app_details = AsyncMock(return_value=None)

        await steam_hydrator._hydrate_store_data(sample_game, 730)

        # Should not modify game or create companies
        assert sample_game.price_json is None


class TestHydrateCompanies:
    async def test_creates_company_and_involvement(self, steam_hydrator, sample_game):
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator._hydrate_companies(sample_game, ["Valve"], ["Valve"])

        add_calls = steam_hydrator.session.add.call_args_list
        companies = [c[0][0] for c in add_calls if isinstance(c[0][0], Company)]
        involved = [c[0][0] for c in add_calls if isinstance(c[0][0], InvolvedCompany)]

        assert len(companies) == 0  # add_all used for new companies
        assert len(involved) == 1
        assert involved[0].developer is True
        assert involved[0].publisher is True

    async def test_separate_developer_and_publisher(self, steam_hydrator, sample_game):
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator._hydrate_companies(
            sample_game, ["Valve"], ["Electronic Arts"]
        )

        add_calls = steam_hydrator.session.add.call_args_list
        involved = [c[0][0] for c in add_calls if isinstance(c[0][0], InvolvedCompany)]
        assert len(involved) == 2

        dev_ic = next(ic for ic in involved if ic.developer)
        pub_ic = next(ic for ic in involved if ic.publisher)
        assert dev_ic is not pub_ic
        assert dev_ic.developer is True
        assert dev_ic.publisher is False
        assert pub_ic.publisher is True
        assert pub_ic.developer is False

    async def test_reuses_existing_company(self, steam_hydrator, sample_game):
        existing = Company(name="Valve", slug="valve")
        steam_hydrator.session.scalars.return_value = [existing]

        await steam_hydrator._hydrate_companies(sample_game, ["Valve"], None)

        # add_all should not be called (no new companies)
        steam_hydrator.session.add_all.assert_not_called()
        # add should be called for InvolvedCompany only
        add_calls = steam_hydrator.session.add.call_args_list
        involved = [c[0][0] for c in add_calls if isinstance(c[0][0], InvolvedCompany)]
        assert len(involved) == 1
        assert involved[0].company_id == existing.id

    async def test_skips_when_no_companies(self, steam_hydrator, sample_game):
        await steam_hydrator._hydrate_companies(sample_game, None, None)

        steam_hydrator.session.scalars.assert_not_called()

    async def test_skips_when_empty_lists(self, steam_hydrator, sample_game):
        await steam_hydrator._hydrate_companies(sample_game, [], [])

        steam_hydrator.session.scalars.assert_not_called()

    async def test_deletes_existing_links(self, steam_hydrator, sample_game):
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator._hydrate_companies(sample_game, ["Valve"], None)

        # Should execute a DELETE for old links
        steam_hydrator.session.execute.assert_called_once()

    async def test_slugifies_company_names(self, steam_hydrator, sample_game):
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator._hydrate_companies(sample_game, ["CD Projekt Red"], None)

        # add_all should have been called with a Company with slug "cd-projekt-red"
        add_all_calls = steam_hydrator.session.add_all.call_args_list
        assert len(add_all_calls) == 1
        new_companies = add_all_calls[0][0][0]
        assert len(new_companies) == 1
        assert new_companies[0].slug == "cd-projekt-red"


class TestUpsertSteamUserRating:
    async def test_creates_new_rating(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalar.return_value = None

        await steam_hydrator._upsert_steam_user_rating(sample_game, steam_store_raw)

        steam_hydrator.session.add.assert_called_once()
        added = steam_hydrator.session.add.call_args[0][0]
        assert isinstance(added, ExternalRating)
        assert added.provider == "steam_user"
        assert added.score == 88.0
        assert added.max_score == 100.0
        assert added.vote_count == 7500000

    async def test_updates_existing_rating(self, steam_hydrator, sample_game, steam_store_raw):
        existing = ExternalRating(
            media_item_id=sample_game.media_item_id,
            provider="steam_user",
            score=80.0,
            max_score=100.0,
            vote_count=1000000,
        )
        steam_hydrator.session.scalar.return_value = existing

        await steam_hydrator._upsert_steam_user_rating(sample_game, steam_store_raw)

        assert existing.score == 88.0
        assert existing.vote_count == 7500000
        steam_hydrator.session.add.assert_not_called()

    async def test_skips_same_score_and_count(self, steam_hydrator, sample_game, steam_store_raw):
        existing = ExternalRating(
            media_item_id=sample_game.media_item_id,
            provider="steam_user",
            score=88.0,
            max_score=100.0,
            vote_count=7500000,
        )
        steam_hydrator.session.scalar.return_value = existing

        await steam_hydrator._upsert_steam_user_rating(sample_game, steam_store_raw)

        # No change — score and count match
        assert existing.score == 88.0
        steam_hydrator.session.add.assert_not_called()

    async def test_skips_zero_score(self, steam_hydrator, sample_game):
        steam_hydrator.session.scalar.return_value = None
        data = {"review_score": 0, "total_reviews": 0}

        await steam_hydrator._upsert_steam_user_rating(sample_game, data)

        steam_hydrator.session.add.assert_not_called()

    async def test_skips_missing_score_data(self, steam_hydrator, sample_game, steam_store_minimal):
        await steam_hydrator._upsert_steam_user_rating(sample_game, steam_store_minimal)

        steam_hydrator.session.scalar.assert_not_called()


class TestUpsertSteamMetacriticRating:
    async def test_creates_new_metacritic_rating(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalar.return_value = None

        await steam_hydrator._upsert_steam_metacritic_rating(sample_game, steam_store_raw)

        steam_hydrator.session.add.assert_called_once()
        added = steam_hydrator.session.add.call_args[0][0]
        assert isinstance(added, ExternalRating)
        assert added.provider == "steam_metacritic"
        assert added.score == 88.0
        assert added.max_score == 100.0

    async def test_updates_existing_metacritic(self, steam_hydrator, sample_game, steam_store_raw):
        existing = ExternalRating(
            media_item_id=sample_game.media_item_id,
            provider="steam_metacritic",
            score=75.0,
            max_score=100.0,
        )
        steam_hydrator.session.scalar.return_value = existing

        await steam_hydrator._upsert_steam_metacritic_rating(sample_game, steam_store_raw)

        assert existing.score == 88.0
        steam_hydrator.session.add.assert_not_called()

    async def test_skips_same_metacritic_score(self, steam_hydrator, sample_game, steam_store_raw):
        existing = ExternalRating(
            media_item_id=sample_game.media_item_id,
            provider="steam_metacritic",
            score=88.0,
            max_score=100.0,
        )
        steam_hydrator.session.scalar.return_value = existing

        await steam_hydrator._upsert_steam_metacritic_rating(sample_game, steam_store_raw)

        steam_hydrator.session.add.assert_not_called()

    async def test_skips_missing_metacritic(self, steam_hydrator, sample_game, steam_store_minimal):
        await steam_hydrator._upsert_steam_metacritic_rating(sample_game, steam_store_minimal)

        steam_hydrator.session.scalar.assert_not_called()


class TestHydrateScreenshots:
    async def test_creates_screenshots(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator._hydrate_screenshots(sample_game, steam_store_raw)

        add_calls = steam_hydrator.session.add.call_args_list
        assets = [c[0][0] for c in add_calls if isinstance(c[0][0], MediaAsset)]
        assert len(assets) == 2
        assert all(a.asset_type == "screenshot" for a in assets)
        assert all(a.provider == "steam" for a in assets)
        assert {a.url for a in assets} == {"/full1.jpg", "/full2.jpg"}

    async def test_skips_existing_urls(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalars.return_value = ["/full1.jpg", "/full2.jpg"]

        await steam_hydrator._hydrate_screenshots(sample_game, steam_store_raw)

        steam_hydrator.session.add.assert_not_called()

    async def test_partial_deduplication(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalars.return_value = ["/full1.jpg"]

        await steam_hydrator._hydrate_screenshots(sample_game, steam_store_raw)

        add_calls = steam_hydrator.session.add.call_args_list
        assets = [c[0][0] for c in add_calls if isinstance(c[0][0], MediaAsset)]
        assert len(assets) == 1
        assert assets[0].url == "/full2.jpg"

    async def test_no_screenshots(self, steam_hydrator, sample_game, steam_store_minimal):
        await steam_hydrator._hydrate_screenshots(sample_game, steam_store_minimal)

        steam_hydrator.session.scalars.assert_not_called()


class TestHydrateMovies:
    async def test_creates_movies(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator._hydrate_movies(sample_game, steam_store_raw)

        add_calls = steam_hydrator.session.add.call_args_list
        videos = [c[0][0] for c in add_calls if isinstance(c[0][0], MediaVideo)]
        assert len(videos) == 1
        assert videos[0].video_type == "trailer"
        assert videos[0].provider == "steam"
        assert videos[0].url == "https://cdn.steamstatic.com/movie_max.webm"
        assert videos[0].provider_id == "Launch Trailer"

    async def test_skips_existing_urls(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.session.scalars.return_value = [
            "https://cdn.steamstatic.com/movie_max.webm"
        ]

        await steam_hydrator._hydrate_movies(sample_game, steam_store_raw)

        steam_hydrator.session.add.assert_not_called()

    async def test_no_movies(self, steam_hydrator, sample_game, steam_store_minimal):
        await steam_hydrator._hydrate_movies(sample_game, steam_store_minimal)

        steam_hydrator.session.scalars.assert_not_called()


class TestHydrateFull:
    async def test_hydrate_runs_both_phases(self, steam_hydrator, sample_game, steam_store_raw):
        steam_hydrator.provider.get_current_players = AsyncMock(
            return_value={"response": {"player_count": 50000, "result": 1}}
        )
        steam_hydrator.provider.get_app_details = AsyncMock(return_value=steam_store_raw)
        steam_hydrator.session.scalar.return_value = None
        steam_hydrator.session.scalars.return_value = []

        await steam_hydrator.hydrate(sample_game)

        assert sample_game.current_players == 50000
        assert sample_game.review_summary == "Very Positive"

        # Verify company was created (via add_all)
        add_all_calls = steam_hydrator.session.add_all.call_args_list
        all_new = []
        for call in add_all_calls:
            all_new.extend(call[0][0])
        companies = [o for o in all_new if isinstance(o, Company)]
        assert len(companies) == 1
        assert companies[0].name == "Valve"
