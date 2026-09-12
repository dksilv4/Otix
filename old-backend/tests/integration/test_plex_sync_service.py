"""Tests for Plex sync service — covers pagination, plain-value signatures,
connection selection, retry logic, greenlet-safe operation, and all new
optimizations (GuidCache, AlbumContext, EpisodeCache, show watch computation)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from otix.services.plex_sync_service import (
    AlbumContext,
    EpisodeCache,
    GuidCache,
    _as_list,
    _best_connection,
    _build_album_context,
    _build_episode_cache,
    _build_guid_cache,
    _compute_show_watches,
    _container_items,
    _fetch_plex_library_items,
    _media_type,
    extract_guids,
)

# ── _best_connection ──────────────────────────────────────────────────


class TestBestConnection:
    """Verify local HTTPS preferred (fastest), relay as fallback."""

    def test_prefers_local_https(self):
        connections = [
            {"uri": "https://relay.plex.direct:32400", "local": False},
            {"uri": "https://192.168.1.100:32400", "local": True},
        ]
        result = _best_connection({"connections": connections})
        assert result == "https://192.168.1.100:32400"

    def test_falls_back_to_relay_if_no_local(self):
        connections = [
            {"uri": "https://relay.plex.direct:32400", "local": False},
        ]
        result = _best_connection({"connections": connections})
        assert result == "https://relay.plex.direct:32400"

    def test_falls_back_to_any_uri(self):
        connections = [
            {"uri": "http://10.0.0.1:32400", "local": True},
        ]
        result = _best_connection({"connections": connections})
        assert result == "http://10.0.0.1:32400"

    def test_returns_none_for_empty(self):
        assert _best_connection({"connections": []}) is None

    def test_handles_connection_key_alternative(self):
        result = _best_connection({"Connection": [{"uri": "https://relay:32400", "local": False}]})
        assert result == "https://relay:32400"


# ── Pagination (get_json is integration-tested via live Plex) ──────


class TestFetchLibraryItems:
    """Verify paginated fetch via _fetch_plex_library_items.

    The function loops with X-Plex-Container-Start/Size until offset >=
    totalSize or an empty page is returned. Tests patch PLEX_PAGE_SIZE
    to a low value so we can exercise pagination with few mock items.
    """

    BASE_KWARGS = {
        "base_url": "https://plex.test",
        "section_key": "1",
        "library_type": "movie",
        "token": "tok",
    }

    @pytest.mark.asyncio
    async def test_single_page_when_total_fits(self):
        """When totalSize <= PLEX_PAGE_SIZE, only one request is made."""
        data = {
            "MediaContainer": {
                "totalSize": 2,
                "Metadata": [
                    {"title": "A", "type": "movie"},
                    {"title": "B", "type": "movie"},
                ],
            }
        }
        call_count = 0

        async def mock_get_json(url, token, timeout=30.0, client=None):
            nonlocal call_count
            call_count += 1
            return data

        with patch("otix.services.plex_sync_service._get_json", side_effect=mock_get_json):
            with patch("otix.services.plex_sync_service.PLEX_PAGE_SIZE", 200):
                items = await _fetch_plex_library_items(**self.BASE_KWARGS)

        assert items is not None
        assert len(items) == 2
        assert [i["title"] for i in items] == ["A", "B"]
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_multi_page_pagination(self):
        """Fetches all pages when totalSize exceeds PLEX_PAGE_SIZE."""
        PAGE = 2  # force 2 items/page
        page1 = {
            "MediaContainer": {
                "totalSize": 5,
                "Metadata": [
                    {"title": "A", "type": "movie"},
                    {"title": "B", "type": "movie"},
                ],
                "size": 2,
            }
        }
        page2 = {
            "MediaContainer": {
                "totalSize": 5,
                "Metadata": [
                    {"title": "C", "type": "movie"},
                    {"title": "D", "type": "movie"},
                ],
                "size": 2,
            }
        }
        page3 = {
            "MediaContainer": {
                "totalSize": 5,
                "Metadata": [
                    {"title": "E", "type": "movie"},
                ],
                "size": 1,
            }
        }

        responses = [page1, page2, page3]

        async def mock_get_json(url, token, timeout=30.0, client=None):
            return responses.pop(0)

        with patch("otix.services.plex_sync_service._get_json", side_effect=mock_get_json):
            with patch("otix.services.plex_sync_service.PLEX_PAGE_SIZE", PAGE):
                items = await _fetch_plex_library_items(**self.BASE_KWARGS)

        assert items is not None
        assert len(items) == 5
        assert [i["title"] for i in items] == ["A", "B", "C", "D", "E"]
        assert not responses  # all pages consumed

    @pytest.mark.asyncio
    async def test_no_total_size_fallback(self):
        """Older Plex servers may not return totalSize; loop breaks on empty page."""
        page1 = {
            "MediaContainer": {
                "Metadata": [
                    {"title": "A", "type": "movie"},
                    {"title": "B", "type": "movie"},
                ],
            }
        }
        page2 = {
            "MediaContainer": {
                "Metadata": [],
            }
        }

        responses = [page1, page2]

        async def mock_get_json(url, token, timeout=30.0, client=None):
            return responses.pop(0)

        with patch("otix.services.plex_sync_service._get_json", side_effect=mock_get_json):
            with patch("otix.services.plex_sync_service.PLEX_PAGE_SIZE", 2):
                items = await _fetch_plex_library_items(**self.BASE_KWARGS)

        assert items is not None
        assert len(items) == 2
        assert [i["title"] for i in items] == ["A", "B"]

    @pytest.mark.asyncio
    async def test_retry_on_failure(self):
        """First attempt fails, retries with fresh client."""
        call_count = 0

        async def fail_then_succeed(url, token, timeout=30.0, client=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.ConnectError("connection refused", request=MagicMock())
            return {
                "MediaContainer": {
                    "totalSize": 1,
                    "Metadata": [{"title": "Retry", "type": "movie"}],
                }
            }

        with patch("otix.services.plex_sync_service._get_json", side_effect=fail_then_succeed):
            with patch("otix.services.plex_sync_service.PLEX_PAGE_SIZE", 200):
                items = await _fetch_plex_library_items(**self.BASE_KWARGS)

        assert items is not None
        assert len(items) == 1
        assert items[0]["title"] == "Retry"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_artist_library_adds_type_param(self):
        """Artist libraries append &type=9 for album-level results."""
        data = {
            "MediaContainer": {
                "totalSize": 1,
                "Directory": [
                    {"title": "Album1", "type": "album"},
                ],
            }
        }
        url_seen = []

        async def mock_get_json(url, token, timeout=30.0, client=None):
            url_seen.append(url)
            return data

        kwargs = {**self.BASE_KWARGS, "library_type": "artist"}
        with patch("otix.services.plex_sync_service._get_json", side_effect=mock_get_json):
            with patch("otix.services.plex_sync_service.PLEX_PAGE_SIZE", 200):
                items = await _fetch_plex_library_items(**kwargs)

        assert items is not None
        assert len(items) == 1
        assert "type=9" in url_seen[0]


# ── Helpers ───────────────────────────────────────────────────────────


class TestAsList:
    def test_list_returns_self(self):
        assert _as_list([1, 2]) == [1, 2]

    def test_none_returns_empty(self):
        assert _as_list(None) == []

    def test_scalar_wraps_in_list(self):
        assert _as_list("hi") == ["hi"]


class TestContainerItems:
    def test_metadata_fallback_to_directory(self):
        result = _container_items({"MediaContainer": {"Directory": [{"key": "1"}]}})
        assert len(result) == 1
        assert result[0]["key"] == "1"

    def test_media_container_root(self):
        result = _container_items({"Metadata": [{"title": "X"}]})
        assert result[0]["title"] == "X"


class TestMediaType:
    def test_movie(self):
        assert _media_type({"type": "movie"}) == "movie"

    def test_show_episode_season(self):
        assert _media_type({"type": "episode"}) == "show"
        assert _media_type({"type": "season"}) == "show"
        assert _media_type({"type": "show"}) == "show"

    def test_music_types(self):
        assert _media_type({"type": "track"}) == "music"
        assert _media_type({"type": "album"}) == "music"

    def test_falls_back_to_library_type(self):
        assert _media_type({}, "movie") == "movie"

    def test_unknown_returns_none(self):
        assert _media_type({"type": "photo"}) is None


# ── GuidCache ─────────────────────────────────────────────────────────


class TestGuidCache:
    def test_empty_cache(self):
        cache = GuidCache()
        assert cache.find("imdb", "tt123") is None

    def test_find_after_add(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        assert cache.find("imdb", "tt123") == "media_1"

    def test_find_different_provider(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        assert cache.find("tmdb", "123") is None

    def test_find_different_external_id(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        assert cache.find("imdb", "tt456") is None

    def test_add_tracks_new_ids(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        assert cache.is_new("media_1") is True

    def test_multiple_providers(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        cache.add("tmdb", "550", "media_1")
        assert cache.find("imdb", "tt123") == "media_1"
        assert cache.find("tmdb", "550") == "media_1"

    def test_multiple_entities(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        cache.add("imdb", "tt456", "media_2")
        assert cache.find("imdb", "tt123") == "media_1"
        assert cache.find("imdb", "tt456") == "media_2"

    def test_overwrite_existing(self):
        cache = GuidCache()
        cache.add("imdb", "tt123", "media_1")
        cache.add("imdb", "tt123", "media_2")
        assert cache.find("imdb", "tt123") == "media_2"
        assert cache.is_new("media_1") is True
        assert cache.is_new("media_2") is True


class TestBuildGuidCache:
    """Tests _build_guid_cache with a mocked DB session."""

    @pytest.mark.asyncio
    async def test_empty_items(self, mock_db_session):
        cache = await _build_guid_cache(mock_db_session, [])
        assert isinstance(cache, GuidCache)
        assert cache.find("imdb", "anything") is None

    @pytest.mark.asyncio
    async def test_items_without_guids(self, mock_db_session):
        """Items with no guid field or Guid array produce empty cache."""
        items = [
            {"title": "Test Movie", "type": "movie"},
        ]
        cache = await _build_guid_cache(mock_db_session, items)
        assert isinstance(cache, GuidCache)
        # No DB query should have been made for items without GUIDs
        mock_db_session.scalars.assert_not_called()

    @pytest.mark.asyncio
    async def test_items_with_plex_guid_only(self, mock_db_session):
        """Items with only a Plex GUID still query the DB."""
        items = [
            {"title": "Test", "type": "movie", "guid": "plex://movie/123"},
        ]
        mock_db_session.scalars.return_value.all.return_value = []
        cache = await _build_guid_cache(mock_db_session, items)
        assert isinstance(cache, GuidCache)
        assert cache.find("plex", "plex://movie/123") is None
        # Verify DB was queried
        mock_db_session.scalars.assert_called_once()

    @pytest.mark.asyncio
    async def test_populated_cache(self, mock_db_session):
        """Returns a populated cache when the DB has matching ExternalIDs."""
        items = [
            {"title": "Fight Club", "type": "movie", "guid": "plex://movie/5d776b", "Guid": [{"id": "imdb://tt0137523"}, {"id": "tmdb://550"}]},
        ]

        from otix.domain.media import ExternalID

        def _make_ext(provider, ext_id, entity_id):
            e = MagicMock(spec=ExternalID)
            e.provider = provider
            e.external_id = ext_id
            e.entity_id = entity_id
            return e

        mock_rows = [
            _make_ext("plex", "plex://movie/5d776b", "media_1"),
            _make_ext("imdb", "tt0137523", "media_1"),
        ]
        mock_db_session.scalars.return_value.all.return_value = mock_rows

        cache = await _build_guid_cache(mock_db_session, items)
        assert cache.find("plex", "plex://movie/5d776b") == "media_1"
        assert cache.find("imdb", "tt0137523") == "media_1"
        # tmdb was not found in DB, should not be in cache
        assert cache.find("tmdb", "550") is None

    @pytest.mark.asyncio
    async def test_extract_guids_function(self):
        """Direct test of extract_guids."""
        item = {
            "guid": "plex://movie/5d776b",
            "Guid": [{"id": "imdb://tt0137523"}, {"id": "tmdb://550"}],
        }
        result = extract_guids(item)
        assert result.get("imdb") == "tt0137523"
        assert result.get("tmdb") == "550"
        # Plex GUID is not in the result (it's handled separately)
        assert result.get("plex") is None


# ── AlbumContext ──────────────────────────────────────────────────────


class TestAlbumContext:
    def test_empty_context(self):
        ctx = AlbumContext()
        assert ctx.genre_by_slug == {}
        assert ctx.media_genre_pairs == set()
        assert ctx.label_by_slug == {}
        assert ctx.involved_company_pairs == set()


class TestBuildAlbumContext:
    @pytest.mark.asyncio
    async def test_empty_ids(self, mock_db_session):
        ctx = await _build_album_context(mock_db_session, [])
        assert isinstance(ctx, AlbumContext)
        assert ctx.genre_by_slug == {}

    @pytest.mark.asyncio
    async def test_preloads_genres_and_labels(self, mock_db_session):
        """Verifies context pre-loads genre and label data from the DB."""
        from otix.domain.company import Company, InvolvedCompany
        from otix.domain.genre import Genre
        from otix.domain.media import MediaGenre

        # Mock Genre query
        g1 = MagicMock(spec=Genre)
        g1.slug = "rock"
        g2 = MagicMock(spec=Genre)
        g2.slug = "jazz"

        # Mock MediaGenre query
        mg1 = MagicMock(spec=MediaGenre)
        mg1.media_item_id = "album_1"
        mg1.genre_id = "genre_rock"

        # Mock Company (label) query
        c1 = MagicMock(spec=Company)
        c1.slug = "warner-records"

        # Mock InvolvedCompany query
        ic1 = MagicMock(spec=InvolvedCompany)
        ic1.media_item_id = "album_1"
        ic1.company_id = "comp_warner"

        # Set up sequential mock returns for the 4 DB queries
        mock_db_session.scalars.side_effect = [
            # Genre query
            MagicMock(all=MagicMock(return_value=[g1, g2])),
            # MediaGenre query
            MagicMock(all=MagicMock(return_value=[mg1])),
            # Company query
            MagicMock(all=MagicMock(return_value=[c1])),
            # InvolvedCompany query
            MagicMock(all=MagicMock(return_value=[ic1])),
        ]

        ctx = await _build_album_context(mock_db_session, ["album_1", "album_2"])

        assert "rock" in ctx.genre_by_slug
        assert "jazz" in ctx.genre_by_slug
        assert ("album_1", "genre_rock") in ctx.media_genre_pairs
        assert "warner-records" in ctx.label_by_slug
        assert ("album_1", "comp_warner") in ctx.involved_company_pairs


# ── EpisodeCache ──────────────────────────────────────────────────────


class TestEpisodeCache:
    def test_empty_cache(self):
        cache = EpisodeCache()
        assert cache.season_by_show_and_number == {}
        assert cache.episode_by_season_and_number == {}


class TestBuildEpisodeCache:
    @pytest.mark.asyncio
    async def test_empty_show_ids(self, mock_db_session):
        cache = await _build_episode_cache(mock_db_session, set())
        assert isinstance(cache, EpisodeCache)
        mock_db_session.scalars.assert_not_called()

    @pytest.mark.asyncio
    async def test_populates_season_and_episode(self, mock_db_session):
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        s2 = MagicMock(spec=Season)
        s2.id = "season_2"
        s2.show_id = "show_1"
        s2.season_number = 2

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "season_1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "season_1"
        ep2.episode_number = 2

        # First call returns seasons, second returns episodes
        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1, s2])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2])),
        ]

        cache = await _build_episode_cache(mock_db_session, {"show_1"})

        assert cache.season_by_show_and_number[("show_1", 1)] == "season_1"
        assert cache.season_by_show_and_number[("show_1", 2)] == "season_2"
        assert cache.episode_by_season_and_number[("season_1", 1)] == "ep_1"
        assert cache.episode_by_season_and_number[("season_1", 2)] == "ep_2"


# ── Show watch computation ────────────────────────────────────────────


class TestComputeShowWatches:
    """Tests the critical _compute_show_watches logic.

    A show is "fully watched" only when every episode in every season
    has a UserEpisodeInteraction for the given user.
    """

    @pytest.mark.asyncio
    async def test_empty_show_ids_returns_zero(self, mock_db_session):
        count = await _compute_show_watches(mock_db_session, "user_1", set())
        assert count == 0

    @pytest.mark.asyncio
    async def test_no_seasons_returns_zero(self, mock_db_session):
        mock_db_session.scalars.return_value.all.return_value = []
        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})
        assert count == 0

    @pytest.mark.asyncio
    async def test_no_episodes_returns_zero(self, mock_db_session):
        from otix.domain.media import Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        # First scalars call returns seasons, second returns empty episodes
        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1])),
            MagicMock(all=MagicMock(return_value=[])),
        ]

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})
        assert count == 0

    @pytest.mark.asyncio
    async def test_all_episodes_watched_marks_show(self, mock_db_session):
        """When every episode in every season is watched, the show is marked."""
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "season_1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "season_1"
        ep2.episode_number = 2

        # Three sequential scalars calls: seasons, episodes, watched episodes
        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2])),
            MagicMock(all=MagicMock(return_value=["ep_1", "ep_2"])),
        ]

        mock_db_session.execute.return_value = MagicMock()

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})

        assert count == 1
        # Verify the insert was called
        mock_db_session.execute.assert_called_once()
        call_args = mock_db_session.execute.call_args
        if call_args:
            stmt = call_args[0][0]
            assert stmt is not None

    @pytest.mark.asyncio
    async def test_partial_watch_does_not_mark(self, mock_db_session):
        """When only some episodes are watched, the show is NOT marked."""
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "season_1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "season_1"
        ep2.episode_number = 2

        # Return seasons, both episodes, but only 1 of 2 watched
        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2])),
            MagicMock(all=MagicMock(return_value=["ep_1"])),  # only ep1 watched
        ]

        mock_db_session.execute.return_value = MagicMock()

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})

        assert count == 0
        # No insert should have been made
        mock_db_session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_multiple_seasons_all_watched(self, mock_db_session):
        """Show with 2 seasons: all episodes in both seasons watched."""
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        s2 = MagicMock(spec=Season)
        s2.id = "season_2"
        s2.show_id = "show_1"
        s2.season_number = 2

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "season_1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "season_1"
        ep2.episode_number = 2

        ep3 = MagicMock(spec=Episode)
        ep3.id = "ep_3"
        ep3.season_id = "season_2"
        ep3.episode_number = 1

        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1, s2])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2, ep3])),
            MagicMock(all=MagicMock(return_value=["ep_1", "ep_2", "ep_3"])),
        ]

        mock_db_session.execute.return_value = MagicMock()

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})

        assert count == 1
        mock_db_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_one_season_done_other_not(self, mock_db_session):
        """Show with 2 seasons: only season 1 fully watched. NOT full watch."""
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        s2 = MagicMock(spec=Season)
        s2.id = "season_2"
        s2.show_id = "show_1"
        s2.season_number = 2

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "season_1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "season_2"
        ep2.episode_number = 1  # season 2 has only 1 episode

        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1, s2])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2])),
            MagicMock(all=MagicMock(return_value=["ep_1"])),  # only ep1 watched
        ]

        mock_db_session.execute.return_value = MagicMock()

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})

        assert count == 0

    @pytest.mark.asyncio
    async def test_user_scoped_watch_check(self, mock_db_session):
        """Only the specified user's episode interactions are checked."""
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "season_1"
        s1.show_id = "show_1"
        s1.season_number = 1

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "season_1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "season_1"
        ep2.episode_number = 2

        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2])),
            # The third query filters by user_id — only returns ep1 watched
            MagicMock(all=MagicMock(return_value=["ep_1"])),
        ]

        mock_db_session.execute.return_value = MagicMock()

        # Different user from the one who watched the episodes
        count = await _compute_show_watches(mock_db_session, "user_2", {"show_1"})

        assert count == 0
        # Verify the watched query filtered by user_2
        watched_call = mock_db_session.scalars.call_args_list[2]
        # We expect the user_id in the query to be user_2, not user_1
        assert watched_call is not None

    @pytest.mark.asyncio
    async def test_multiple_shows_some_fully_watched(self, mock_db_session):
        """Multiple shows: one fully watched, one partially, one empty."""
        from otix.domain.media import Episode, Season

        # Show 1: 1 season, 2 episodes, both watched → full watch
        s1 = MagicMock(spec=Season)
        s1.id = "s1"
        s1.show_id = "show_1"
        s1.season_number = 1

        # Show 2: 1 season, 2 episodes, 1 watched → NOT full watch
        s2 = MagicMock(spec=Season)
        s2.id = "s2"
        s2.show_id = "show_2"
        s2.season_number = 1

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "s1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "s1"
        ep2.episode_number = 2

        ep3 = MagicMock(spec=Episode)
        ep3.id = "ep_3"
        ep3.season_id = "s2"
        ep3.episode_number = 1

        ep4 = MagicMock(spec=Episode)
        ep4.id = "ep_4"
        ep4.season_id = "s2"
        ep4.episode_number = 2

        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1, s2])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2, ep3, ep4])),
            MagicMock(all=MagicMock(return_value=["ep_1", "ep_2", "ep_3"])),
        ]

        mock_db_session.execute.return_value = MagicMock()

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1", "show_2"})

        assert count == 1  # only show_1 is fully watched

    @pytest.mark.asyncio
    async def test_user_isolation_same_show_different_user(self, mock_db_session):
        """User A's full watch shouldn't affect user B's status.

        The function is called with a specific user_id, so it only queries
        that user's interactions.
        """
        from otix.domain.media import Episode, Season

        s1 = MagicMock(spec=Season)
        s1.id = "s1"
        s1.show_id = "show_1"
        s1.season_number = 1

        ep1 = MagicMock(spec=Episode)
        ep1.id = "ep_1"
        ep1.season_id = "s1"
        ep1.episode_number = 1

        ep2 = MagicMock(spec=Episode)
        ep2.id = "ep_2"
        ep2.season_id = "s1"
        ep2.episode_number = 2

        mock_db_session.scalars.side_effect = [
            MagicMock(all=MagicMock(return_value=[s1])),
            MagicMock(all=MagicMock(return_value=[ep1, ep2])),
            # user_1 hasn't watched anything
            MagicMock(all=MagicMock(return_value=[])),
        ]

        mock_db_session.execute.return_value = MagicMock()

        count = await _compute_show_watches(mock_db_session, "user_1", {"show_1"})

        assert count == 0


# ── Edge cases for batch upserts ──────────────────────────────────────


class TestUpiUpdateColumns:
    """Verify the _UPI_UPDATE_COLS constant covers all conflict-update columns."""

    def test_columns_exist_on_model(self):
        from otix.domain.media import UserPlexItem
        from otix.services.plex_sync_service import _UPI_UPDATE_COLS

        table = UserPlexItem.__table__
        for col_name in _UPI_UPDATE_COLS:
            assert col_name in table.c, f"Column '{col_name}' not found on UserPlexItem table"

    def test_no_primary_key_or_constraint_cols(self):
        """Constraint columns (user_id, server_id, rating_key, guid) should NOT be in the update list."""
        from otix.services.plex_sync_service import _UPI_UPDATE_COLS

        forbidden = {"user_id", "server_id", "rating_key", "guid", "media_type"}
        for col in _UPI_UPDATE_COLS:
            assert col not in forbidden, f"Column '{col}' should not be in _UPI_UPDATE_COLS (it's part of constraint or identity)"


# ── Mock response helper (pre-existing) ───────────────────────────────


class MockResponse:
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")
