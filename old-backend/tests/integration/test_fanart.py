"""Tests for Fanart provider — transformer, hydrator, and client."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.media import ExternalID
from otix.providers.fanart.client import FanartProvider
from otix.providers.fanart.hydrator import FanartHydrator
from otix.providers.fanart.transformer import movie_images_to_assets, show_images_to_assets
<<<<<<<< HEAD:backend/tests/integration/test_fanart.py
========

>>>>>>>> ea8cecd521e6532e3b42fd9d9077aa9a7a96f899:old-backend/tests/integration/test_fanart.py

def _asset_rows(mock_db_session: AsyncMock) -> list[dict]:
    """Extract row dicts from AssetPipeline.store's bulk media_assets insert.

    store() issues a single ``pg_insert(MediaAsset)``; the row data lives in
    ``_multi_values`` as (Column → value) pairs. Returns [] when no bulk insert
    was issued (e.g. the asset batch was empty).
    """
    from sqlalchemy.sql.dml import Insert

    for call in mock_db_session.execute.call_args_list:
        stmt = call.args[0]
        if not isinstance(stmt, Insert):
            continue
        if getattr(stmt.table, "name", None) != "media_assets":
            continue
        # _multi_values is a 1-tuple holding the list of row dicts keyed by Column
        row_dicts = stmt._multi_values[0]
        return [{col.key: value for col, value in rd.items()} for rd in row_dicts]
    return []


def _asset_insert_sql(mock_db_session: AsyncMock) -> str | None:
    """Compile the media_assets bulk insert to SQL with literal values inlined."""
    from sqlalchemy.dialects import postgresql as pg_dialect
    from sqlalchemy.sql.dml import Insert

    for call in mock_db_session.execute.call_args_list:
        stmt = call.args[0]
        if not isinstance(stmt, Insert):
            continue
        sql = str(
            stmt.compile(dialect=pg_dialect.dialect(), compile_kwargs={"literal_binds": True})
        )
        if "media_assets" in sql:
            return sql
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# Sample Fanart responses
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def fanart_movie_raw() -> dict:
    return {
        "name": "Fight Club",
        "tmdb_id": "550",
        "imdb_id": "tt0137523",
        "movieposter": [
            {"id": "1", "url": "https://fanart.tv/fanart/movie/550/poster1.jpg", "lang": "en", "likes": "10"},
            {"id": "2", "url": "https://fanart.tv/fanart/movie/550/poster2.jpg", "lang": "en", "likes": "5"},
            {"id": "7", "url": "https://fanart.tv/fanart/movie/550/poster_textless.jpg", "lang": "00", "likes": "15"},
        ],
        "hdmovieclearart": [
            {"id": "3", "url": "https://fanart.tv/fanart/movie/550/clearart_hd.png", "lang": "en", "likes": "8"},
        ],
        "movieclearart": [
            {"id": "3", "url": "https://fanart.tv/fanart/movie/550/clearart_hd.png", "lang": "en", "likes": "3"},
        ],
        "hdmovielogo": [
            {"id": "4", "url": "https://fanart.tv/fanart/movie/550/logo_hd.png", "lang": "en", "likes": "12"},
        ],
        "movielogo": [],
        "moviebackground": [
            {"id": "5", "url": "https://fanart.tv/fanart/movie/550/bg.jpg", "lang": "", "likes": "7"},
        ],
        "moviebanner": [],
        "moviethumb": [],
        "moviedisc": [
            {"id": "6", "url": "https://fanart.tv/fanart/movie/550/disc.png", "lang": "en", "likes": "2"},
        ],
    }


@pytest.fixture
def fanart_show_raw() -> dict:
    return {
        "name": "Game of Thrones",
        "tvdb_id": "121361",
        "tvposter": [
            {"id": "10", "url": "https://fanart.tv/fanart/tv/121361/poster1.jpg", "lang": "en", "likes": "20"},
            {"id": "11", "url": "https://fanart.tv/fanart/tv/121361/poster2.jpg", "lang": "en", "likes": "15"},
            {"id": "18", "url": "https://fanart.tv/fanart/tv/121361/poster_textless.jpg", "lang": "00", "likes": "22"},
        ],
        "showbackground": [
            {"id": "12", "url": "https://fanart.tv/fanart/tv/121361/bg.jpg", "lang": "", "likes": "9"},
        ],
        "hdtvlogo": [
            {"id": "19", "url": "https://fanart.tv/fanart/tv/121361/logo_hd.png", "lang": "en", "likes": "25"},
        ],
        "clearlogo": [
            {"id": "13", "url": "https://fanart.tv/fanart/tv/121361/logo.png", "lang": "en", "likes": "18"},
        ],
        "tvlogo": [],
        "hdclearart": [
            {"id": "14", "url": "https://fanart.tv/fanart/tv/121361/clearart_hd.png", "lang": "en", "likes": "11"},
        ],
        "tvbanner": [
            {"id": "15", "url": "https://fanart.tv/fanart/tv/121361/banner.jpg", "lang": "en", "likes": "6"},
        ],
        "tvthumb": [],
        "seasonposter": [
            {"id": "16", "url": "https://fanart.tv/fanart/tv/121361/s1_poster.jpg", "season": "1", "lang": "en", "likes": "14"},
            {"id": "17", "url": "https://fanart.tv/fanart/tv/121361/s2_poster.jpg", "season": "2", "lang": "en", "likes": "12"},
        ],
    }




# ═══════════════════════════════════════════════════════════════════════════════
# Transformer tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestFanartTransformer:

    # ── movie_images_to_assets ────────────────────────────────────────

    def test_extracts_all_movie_categories(self, fanart_movie_raw: dict):
        assets = movie_images_to_assets(fanart_movie_raw, "oti_test00000001")

        types = {a.asset_type for a in assets}
        assert types >= {"poster", "clearart", "logo", "backdrop", "disc"}

    def test_dedup_urls_within_movie(self, fanart_movie_raw: dict):
        """HD and SD clearart with same URL — only one record."""
        assets = movie_images_to_assets(fanart_movie_raw, "oti_test00000001")

        cleararts = [a for a in assets if a.asset_type == "clearart"]
        assert len(cleararts) == 1  # HD + SD deduped

    def test_all_assets_have_correct_metadata(self, fanart_movie_raw: dict):
        assets = movie_images_to_assets(fanart_movie_raw, "oti_test00000001")

        for a in assets:
            assert a.media_item_id == "oti_test00000001"
            assert a.provider == "fanart"
            assert a.url.startswith("https://fanart.tv/")
            # lang can be None (empty in API response) or a code like "en", "00"

    def test_extracts_lang_including_textless(self, fanart_movie_raw: dict):
        assets = movie_images_to_assets(fanart_movie_raw, "oti_test00000001")

        by_url = {a.url: a.lang for a in assets}
        assert by_url["https://fanart.tv/fanart/movie/550/poster1.jpg"] == "en"
        assert by_url["https://fanart.tv/fanart/movie/550/poster_textless.jpg"] == "00"

    def test_empty_lang_becomes_none(self, fanart_movie_raw: dict):
        assets = movie_images_to_assets(fanart_movie_raw, "oti_test00000001")

        backdrop = [a for a in assets if a.asset_type == "backdrop"]
        assert len(backdrop) == 1
        assert backdrop[0].lang is None  # fixture has lang=""

    def test_empty_movie_raw(self):
        assets = movie_images_to_assets({}, "oti_test00000001")
        assert assets == []

    def test_movie_with_empty_categories(self):
        raw = {
            "movieposter": [], "moviebackground": [], "hdmovieclearart": [],
            "movieclearart": [], "hdmovielogo": [], "movielogo": [],
            "moviebanner": [], "moviethumb": [], "moviedisc": [],
        }
        assets = movie_images_to_assets(raw, "oti_test00000001")
        assert assets == []

    def test_movie_skips_entries_without_url(self):
        raw = {
            "movieposter": [{"id": "1", "likes": "5"}],
            "moviebackground": [],
            "hdmovieclearart": [], "movieclearart": [], "hdmovielogo": [],
            "movielogo": [], "moviebanner": [], "moviethumb": [], "moviedisc": [],
        }
        assets = movie_images_to_assets(raw, "oti_test00000001")
        assert assets == []

    # ── show_images_to_assets ─────────────────────────────────────────

    def test_extracts_all_show_categories(self, fanart_show_raw: dict):
        assets = show_images_to_assets(fanart_show_raw, "oti_test00000002")

        types = {a.asset_type for a in assets}
        assert types >= {"poster", "backdrop", "logo", "clearart", "banner"}

    def test_season_posters_extracted(self, fanart_show_raw: dict):
        assets = show_images_to_assets(fanart_show_raw, "oti_test00000002")

        posters = [a for a in assets if a.asset_type == "poster"]
        # 3 tvposter + 2 seasonposter = 5 total posters
        assert len(posters) == 5

    def test_empty_show_raw(self):
        assets = show_images_to_assets({}, "oti_test00000002")
        assert assets == []



# ═══════════════════════════════════════════════════════════════════════════════
# Hydrator tests
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def fanart_hydrator(mock_db_session: AsyncMock) -> FanartHydrator:
    provider = MagicMock(spec=FanartProvider)
    provider.get_movie_images = AsyncMock()
    provider.get_show_images = AsyncMock()
    return FanartHydrator(provider, mock_db_session)


@pytest.fixture
def media_item(make_media_item):
    return make_media_item()


class TestFanartHydrator:

    async def test_hydrate_movie_inserts_new_assets(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_movie_raw: dict,
    ):
        # Cursor lookup: tmdb_id in ExternalID
        tmdb_ext_id = ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tmdb_ext_id
        mock_db_session.scalars.return_value = []
        # store() reports rows inserted via execute().rowcount
        mock_db_session.execute.return_value.rowcount = 7

        fanart_hydrator.provider.get_movie_images.return_value = fanart_movie_raw

        added = await fanart_hydrator.hydrate_movie_images(media_item)

        assert added is True
        fanart_hydrator.provider.get_movie_images.assert_called_once_with(550)

        # Assets stored via the AssetPipeline bulk insert
        rows = _asset_rows(mock_db_session)
        assert len(rows) == 7
        assert all(r["provider"] == "fanart" for r in rows)

    async def test_hydrate_movie_delegates_dedup_to_db(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_movie_raw: dict,
    ):
        """URL dedup is delegated to the DB ON CONFLICT, not an in-process check."""
        tmdb_ext_id = ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tmdb_ext_id
        mock_db_session.scalars.return_value = []
        # 0 rows inserted because the URLs already exist in the DB
        mock_db_session.execute.return_value.rowcount = 0

        fanart_hydrator.provider.get_movie_images.return_value = fanart_movie_raw

        added = await fanart_hydrator.hydrate_movie_images(media_item)

        assert added is False
        sql = _asset_insert_sql(mock_db_session)
        assert sql is not None
        assert "ON CONFLICT" in sql
        # All candidate rows are still sent; the DB silently skips duplicates
        assert len(_asset_rows(mock_db_session)) == 7

    async def test_hydrate_movie_no_tmdb_id(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock, media_item,
    ):
        mock_db_session.scalar.return_value = None

        added = await fanart_hydrator.hydrate_movie_images(media_item)

        assert added is False
        fanart_hydrator.provider.get_movie_images.assert_not_called()

    async def test_hydrate_show_no_tvdb_id(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock, media_item,
    ):
        # tvdb lookup returns None
        mock_db_session.scalar.return_value = None

        added = await fanart_hydrator.hydrate_show_images(media_item)

        assert added is False
        fanart_hydrator.provider.get_show_images.assert_not_called()

    async def test_hydrate_show_inserts_new_assets(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_show_raw: dict,
    ):
        tvdb_ext_id = ExternalID(provider="tvdb", external_id="121361", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tvdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 10

        fanart_hydrator.provider.get_show_images.return_value = fanart_show_raw

        added = await fanart_hydrator.hydrate_show_images(media_item)

        assert added is True
        fanart_hydrator.provider.get_show_images.assert_called_once_with(121361)

    async def test_hydrate_handles_provider_error(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock, media_item,
    ):
        tmdb_ext_id = ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tmdb_ext_id
        fanart_hydrator.provider.get_movie_images.side_effect = Exception("API error")

        added = await fanart_hydrator.hydrate_movie_images(media_item)

        assert added is False



# ═══════════════════════════════════════════════════════════════════════════════
# Client tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestFanartClient:
    async def test_get_movie_images(self, fakeredis, mock_httpx_client, fanart_movie_raw: dict):
        import json

        import httpx

        class FanartTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                url = str(request.url)
                if "/movies/550" in url:
                    return httpx.Response(200, content=json.dumps(fanart_movie_raw).encode(), request=request)
                return httpx.Response(404, content=b'{"status":"error"}', request=request)

        client = httpx.AsyncClient(transport=FanartTransport(), base_url="https://webservice.fanart.tv/v3")
        provider = FanartProvider(fakeredis, client)

        result = await provider.get_movie_images(550)
        assert result["tmdb_id"] == "550"
        assert result["name"] == "Fight Club"
        assert "movieposter" in result

    async def test_get_show_images(self, fakeredis, fanart_show_raw: dict):
        import json

        import httpx

        class ShowTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                url = str(request.url)
                if "/tv/121361" in url:
                    return httpx.Response(200, content=json.dumps(fanart_show_raw).encode(), request=request)
                return httpx.Response(404, content=b'{"status":"error"}', request=request)

        client = httpx.AsyncClient(transport=ShowTransport(), base_url="https://webservice.fanart.tv/v3")
        provider = FanartProvider(fakeredis, client)

        result = await provider.get_show_images(121361)
        assert result["tvdb_id"] == "121361"
        assert result["name"] == "Game of Thrones"
        assert "tvposter" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Full pipeline tests (transformer → hydrator → DB, real logic, mocked I/O)
# ═══════════════════════════════════════════════════════════════════════════════


class TestFanartMoviePipeline:

    async def test_full_movie_pipeline_asset_types(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_movie_raw: dict,
    ):
        """Every Fanart movie category maps to the correct asset_type."""
        tmdb_ext_id = ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tmdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 7

        fanart_hydrator.provider.get_movie_images.return_value = fanart_movie_raw

        await fanart_hydrator.hydrate_movie_images(media_item)

        rows = _asset_rows(mock_db_session)
        by_type: dict[str, list[dict]] = {}
        for r in rows:
            by_type.setdefault(r["asset_type"], []).append(r)

        # 3 poster (2 en + 1 textless 00), 1 clearart (HD+SD deduped), 1 logo, 1 backdrop, 1 disc
        assert len(by_type["poster"]) == 3
        assert len(by_type["clearart"]) == 1
        assert len(by_type["logo"]) == 1
        assert len(by_type["backdrop"]) == 1
        assert len(by_type["disc"]) == 1
        # banner and thumb are empty in fixture
        assert "banner" not in by_type
        assert "thumb" not in by_type
        assert len(rows) == 7  # total unique

    async def test_full_movie_pipeline_lang_extraction(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_movie_raw: dict,
    ):
        """Lang codes are correctly extracted, including textless '00'."""
        tmdb_ext_id = ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tmdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 7

        fanart_hydrator.provider.get_movie_images.return_value = fanart_movie_raw

        await fanart_hydrator.hydrate_movie_images(media_item)

        rows = _asset_rows(mock_db_session)
        by_url = {r["url"]: r for r in rows}

        # en posters
        assert by_url["https://fanart.tv/fanart/movie/550/poster1.jpg"]["lang"] == "en"
        assert by_url["https://fanart.tv/fanart/movie/550/poster2.jpg"]["lang"] == "en"
        # textless poster
        assert by_url["https://fanart.tv/fanart/movie/550/poster_textless.jpg"]["lang"] == "00"
        # en clearart
        assert by_url["https://fanart.tv/fanart/movie/550/clearart_hd.png"]["lang"] == "en"
        # en logo
        assert by_url["https://fanart.tv/fanart/movie/550/logo_hd.png"]["lang"] == "en"
        # empty-lang backdrop → None
        assert by_url["https://fanart.tv/fanart/movie/550/bg.jpg"]["lang"] is None
        # en disc
        assert by_url["https://fanart.tv/fanart/movie/550/disc.png"]["lang"] == "en"

    async def test_full_movie_pipeline_all_provider_fanart(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_movie_raw: dict,
    ):
        """All inserted assets have provider='fanart' and correct media_item_id."""
        tmdb_ext_id = ExternalID(provider="tmdb", external_id="550", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tmdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 7

        fanart_hydrator.provider.get_movie_images.return_value = fanart_movie_raw

        await fanart_hydrator.hydrate_movie_images(media_item)

        rows = _asset_rows(mock_db_session)
        assert all(r["provider"] == "fanart" for r in rows)
        assert all(r["media_item_id"] == media_item.id for r in rows)
        assert all(r["url"].startswith("https://fanart.tv/") for r in rows)


class TestFanartShowPipeline:

    async def test_full_show_pipeline_asset_types(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_show_raw: dict,
    ):
        """Every Fanart show category maps to the correct asset_type."""
        tvdb_ext_id = ExternalID(provider="tvdb", external_id="121361", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tvdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 10

        fanart_hydrator.provider.get_show_images.return_value = fanart_show_raw

        await fanart_hydrator.hydrate_show_images(media_item)

        rows = _asset_rows(mock_db_session)
        by_type: dict[str, list[dict]] = {}
        for r in rows:
            by_type.setdefault(r["asset_type"], []).append(r)

        # 3 tvposter + 2 seasonposter = 5 posters, 1 backdrop, 2 logos, 1 clearart, 1 banner
        assert len(by_type["poster"]) == 5
        assert len(by_type["backdrop"]) == 1
        assert len(by_type["logo"]) == 2
        assert len(by_type["clearart"]) == 1
        assert len(by_type["banner"]) == 1
        assert len(rows) == 10

    async def test_full_show_pipeline_lang_extraction(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_show_raw: dict,
    ):
        """Lang codes including textless '00' on tv posters."""
        tvdb_ext_id = ExternalID(provider="tvdb", external_id="121361", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tvdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 10

        fanart_hydrator.provider.get_show_images.return_value = fanart_show_raw

        await fanart_hydrator.hydrate_show_images(media_item)

        rows = _asset_rows(mock_db_session)
        by_url = {r["url"]: r for r in rows}

        # en posters
        assert by_url["https://fanart.tv/fanart/tv/121361/poster1.jpg"]["lang"] == "en"
        assert by_url["https://fanart.tv/fanart/tv/121361/poster2.jpg"]["lang"] == "en"
        # textless poster
        assert by_url["https://fanart.tv/fanart/tv/121361/poster_textless.jpg"]["lang"] == "00"
        # empty-lang backdrop → None
        assert by_url["https://fanart.tv/fanart/tv/121361/bg.jpg"]["lang"] is None

    async def test_full_show_pipeline_season_posters_in_poster_type(
        self, fanart_hydrator: FanartHydrator, mock_db_session: AsyncMock,
        media_item, fanart_show_raw: dict,
    ):
        """Season posters are classified as asset_type='poster' (not a separate type)."""
        tvdb_ext_id = ExternalID(provider="tvdb", external_id="121361", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = tvdb_ext_id
        mock_db_session.scalars.return_value = []
        mock_db_session.execute.return_value.rowcount = 10

        fanart_hydrator.provider.get_show_images.return_value = fanart_show_raw

        await fanart_hydrator.hydrate_show_images(media_item)

        rows = _asset_rows(mock_db_session)
        season_urls = {
            "https://fanart.tv/fanart/tv/121361/s1_poster.jpg",
            "https://fanart.tv/fanart/tv/121361/s2_poster.jpg",
        }
        season_assets = [r for r in rows if r["url"] in season_urls]
        assert len(season_assets) == 2
        assert all(r["asset_type"] == "poster" for r in season_assets)
        assert all(r["lang"] == "en" for r in season_assets)
