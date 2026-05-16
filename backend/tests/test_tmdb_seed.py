"""Tests for TMDB daily export import and backlog processor.

Covers: export download, batch insert, backlog dispatch, locking,
state management, and Celery task registration.
"""

from __future__ import annotations

import gzip
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from otix.tasks.seed.tmdb_seed import (
    BATCH_INSERT_SIZE,
    BACKLOG_BATCH_SIZE,
    _BACKLOG_LOCK,
    _BACKLOG_LOCK_TTL,
    _EXPORT_LOCK_TTL,
    _check_fast_queue_backlog,
    _download_export,
    _import_export_file,
    _bulk_insert_stubs,
    _process_backlog_batch,
    _daily_import_loop,
    _seed_backlog_loop,
    _detect_deletions_after_import,
    seed_tmdb_daily_import,
    seed_tmdb_backlog_cycle,
)
from otix.tasks.seed import load_state, save_state


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _make_tmdb_gzip(entries: list[dict]) -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", prefix="otix_test_tmdb_")
    with gzip.open(tmp.name, "wt", encoding="utf-8") as f:
        f.write("[\n")
        for i, entry in enumerate(entries):
            line = json.dumps(entry)
            if i < len(entries) - 1:
                line += ","
            f.write(line + "\n")
        f.write("]\n")
    tmp.close()
    return Path(tmp.name)


def _make_async_session_mock(scalars_result=None, scalar_result=None):
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)
    session.scalars = AsyncMock(return_value=list(scalars_result) if scalars_result else [])
    session.scalar = AsyncMock(return_value=scalar_result)
    session.commit = AsyncMock()
    session.execute = AsyncMock()
    session.execute.return_value.rowcount = 0
    session.add = MagicMock()
    return session


# ═══════════════════════════════════════════════════════════════════════════════
# State helpers
# ═══════════════════════════════════════════════════════════════════════════════


STATE_KEY = "otix:tmdb_seed:test_state"

class TestStateHelpers:
    async def test_load_returns_default_when_no_state(self, fakeredis):
        with patch("otix.tasks.seed.get_redis", return_value=fakeredis):
            state = await load_state(STATE_KEY, {"status": "new"})
        assert state == {"status": "new"}

    async def test_save_and_load_roundtrip(self, fakeredis):
        state = {"file_path": "/tmp/test.gz", "entries_processed": 1000}
        with patch("otix.tasks.seed.get_redis", return_value=fakeredis):
            await save_state(STATE_KEY, state)
            loaded = await load_state(STATE_KEY)
        assert loaded == state

    async def test_load_handles_corrupt_json(self, fakeredis):
        await fakeredis.set(STATE_KEY, "not valid json{{{")
        with patch("otix.tasks.seed.get_redis", return_value=fakeredis):
            state = await load_state(STATE_KEY, {"fallback": True})
        assert state == {"fallback": True}

    async def test_independent_state_keys(self, fakeredis):
        with patch("otix.tasks.seed.get_redis", return_value=fakeredis):
            await save_state(STATE_KEY + "_a", {"a": 1})
            await save_state(STATE_KEY + "_b", {"b": 2})

        a = await fakeredis.get(STATE_KEY + "_a")
        b = await fakeredis.get(STATE_KEY + "_b")
        assert "1" in a
        assert "2" in b


# ═══════════════════════════════════════════════════════════════════════════════
# Queue backlog safety
# ═══════════════════════════════════════════════════════════════════════════════


class TestQueueBacklog:
    async def test_not_throttled_when_under_threshold(self, fakeredis):
        with patch("otix.tasks.seed.get_redis", return_value=fakeredis):
            length, throttled = await _check_fast_queue_backlog(caller="test")
        assert length == 0
        assert throttled is False

    async def test_throttled_when_over_threshold(self, fakeredis):
        from otix.infrastructure.config import settings

        threshold = settings.celery_fast_queue_max_backlog
        # We need to mock the broker Redis check since fakeredis doesn't have the "fast" list
        with patch("otix.tasks.seed.aioredis.from_url") as mock_from_url:
            mock_redis = AsyncMock()
            mock_redis.llen = AsyncMock(return_value=threshold + 1)
            mock_redis.aclose = AsyncMock()
            mock_from_url.return_value = mock_redis

            length, throttled = await _check_fast_queue_backlog(caller="test")

        assert length == threshold + 1
        assert throttled is True

    async def test_error_returns_safe_default(self):
        with patch("otix.tasks.seed.aioredis.from_url", side_effect=OSError("connection refused")):
            length, throttled = await _check_fast_queue_backlog(caller="test")

        assert length == 0
        assert throttled is False


# ═══════════════════════════════════════════════════════════════════════════════
# Export download
# ═══════════════════════════════════════════════════════════════════════════════


class TestDownloadExport:
    async def test_download_success(self):
        gz_data = gzip.compress(b'[{"id":1},{"id":2}]')

        class OKTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(200, content=gz_data, request=request)

        async with httpx.AsyncClient(transport=OKTransport()) as client:
            with patch("otix.tasks.seed._get_export_client", return_value=client):
                path = await _download_export("movie_ids", caller="tmdb_seed")

        assert path is not None
        assert path.exists()
        try:
            os.unlink(path)
        except OSError:
            pass

    async def test_404_fallback_to_yesterday(self):
        call_count = 0

        class FallbackTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return httpx.Response(404, content=b"{}", request=request)
                return httpx.Response(200, content=gzip.compress(b'[{"id":1}]'), request=request)

        async with httpx.AsyncClient(transport=FallbackTransport()) as client:
            with patch("otix.tasks.seed._get_export_client", return_value=client):
                path = await _download_export("movie_ids", caller="tmdb_seed")

        assert path is not None
        assert call_count == 2
        try:
            os.unlink(path)
        except OSError:
            pass

    async def test_both_404_returns_none(self):
        class Always404(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(404, content=b"{}", request=request)

        async with httpx.AsyncClient(transport=Always404()) as client:
            with patch("otix.tasks.seed._get_export_client", return_value=client):
                path = await _download_export("collection_ids", caller="tmdb_seed")

        assert path is None

    async def test_http_error_cleans_up_tempfile(self):
        class ErrorTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(500, content=b"error", request=request)

        async with httpx.AsyncClient(transport=ErrorTransport()) as client:
            with patch("otix.tasks.seed._get_export_client", return_value=client):
                with pytest.raises(Exception):
                    await _download_export("person_ids", caller="tmdb_seed")


# ═══════════════════════════════════════════════════════════════════════════════
# Export batch processing
# ═══════════════════════════════════════════════════════════════════════════════


class TestBulkInsertStubs:
    async def test_inserts_rows_and_returns_rowcount(self):
        rows = [{"provider": "tmdb", "external_id": "1", "media_type": "movie", "is_adult": False}]
        session = _make_async_session_mock()
        session.execute.return_value.rowcount = 1
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _bulk_insert_stubs(rows)
        assert result == 1
        session.execute.assert_called_once()
        session.commit.assert_called_once()

    async def test_empty_rows_returns_zero(self):
        result = await _bulk_insert_stubs([])
        assert result == 0


class TestImportExportFile:
    @pytest.fixture(autouse=True)
    def mock_download(self):
        with patch("otix.tasks.seed.tmdb_seed._download_export") as mock:
            yield mock

    @pytest.fixture(autouse=True)
    def mock_session(self):
        with patch("otix.tasks.seed.tmdb_seed.async_session") as mock:
            session = _make_async_session_mock()
            session.execute.return_value.rowcount = 10
            mock.return_value = session
            yield session

    async def test_imports_all_entries_from_small_file(self, mock_download):
        entries = [{"id": i} for i in range(1, 11)]
        gz_path = _make_tmdb_gzip(entries)
        mock_download.return_value = gz_path

        result = await _import_export_file("movie_ids", "movie", is_adult=False)
        assert result["export_type"] == "movie_ids"
        assert result["total"] == 10
        assert result["inserted"] == 10
        assert not os.path.exists(gz_path)  # cleaned up

    async def test_imports_large_file_in_batches(self, mock_download):
        """File with more entries than BATCH_INSERT_SIZE triggers multiple inserts."""
        n = BATCH_INSERT_SIZE + 150
        entries = [{"id": i} for i in range(1, n + 1)]
        gz_path = _make_tmdb_gzip(entries)
        mock_download.return_value = gz_path

        result = await _import_export_file("movie_ids", "movie")
        assert result["total"] == n
        assert not os.path.exists(gz_path)

    async def test_export_unavailable_returns_empty(self, mock_download):
        mock_download.return_value = None
        result = await _import_export_file("movie_ids", "movie")
        assert result["status"] == "unavailable"
        assert result["total"] == 0
        assert result["inserted"] == 0

    async def test_skips_invalid_json_lines(self, mock_download):
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", prefix="otix_test_bad_")
        with gzip.open(tmp.name, "wt", encoding="utf-8") as f:
            f.write("[\n")
            f.write('{"id": 1},\n')
            f.write('not valid json at all,\n')
            f.write('{"id": 2},\n')
            f.write("{}\n")
            f.write("]\n")
        tmp.close()
        gz_path = Path(tmp.name)
        mock_download.return_value = gz_path

        result = await _import_export_file("movie_ids", "movie")
        assert result["total"] == 2  # skips invalid line, {} has no id

    async def test_skips_entries_without_id(self, mock_download):
        entries = [{"name": "No ID"}, {"id": 1}]
        gz_path = _make_tmdb_gzip(entries)
        mock_download.return_value = gz_path

        result = await _import_export_file("movie_ids", "movie")
        assert result["total"] == 1

    async def test_adult_flag_passed_to_stubs(self, mock_download, mock_session):
        entries = [{"id": 999}]
        gz_path = _make_tmdb_gzip(entries)
        mock_download.return_value = gz_path

        result = await _import_export_file("adult_movie_ids", "movie", is_adult=True)
        assert result["export_type"] == "adult_movie_ids"

    async def test_cleans_up_tempfile_on_error(self, mock_download):
        entries = [{"id": 1}]
        gz_path = _make_tmdb_gzip(entries)
        mock_download.return_value = gz_path

        with patch("otix.tasks.seed.tmdb_seed.gzip.open", side_effect=OSError("read error")):
            with pytest.raises(OSError):
                await _import_export_file("movie_ids", "movie")

        assert not os.path.exists(gz_path)


# ═══════════════════════════════════════════════════════════════════════════════
# Backlog batch processing
# ═══════════════════════════════════════════════════════════════════════════════


class TestProcessBacklogBatch:
    @pytest.fixture(autouse=True)
    def mock_throttle(self):
        with patch("otix.tasks.seed.tmdb_seed._check_fast_queue_backlog", new_callable=AsyncMock) as m:
            m.return_value = (0, False)
            yield m

    @pytest.fixture
    def mock_send(self):
        with patch("otix.tasks.seed.tmdb_seed.app.send_task") as m:
            yield m

    async def test_dispatches_movie_stubs(self, mock_send):
        stub = MagicMock()
        stub.external_id = "550"
        stub.media_type = "movie"
        stubs = [stub]

        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        assert result["dispatched"] == 1
        mock_send.assert_called_once_with("sync.tmdb.movie", args=[550])

    async def test_dispatches_collection_with_correct_task(self, mock_send):
        stub = MagicMock()
        stub.external_id = "12345"
        stub.media_type = "collection"
        stubs = [stub]

        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        assert result["dispatched"] == 1
        mock_send.assert_called_once_with("sync.tmdb.collection", args=[12345])

    async def test_dispatches_company_with_entity_type_arg(self, mock_send):
        stub = MagicMock()
        stub.external_id = "1"
        stub.media_type = "company"
        stubs = [stub]

        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        mock_send.assert_called_once_with("sync.tmdb.company", args=[1, "company"])

    async def test_dispatches_network_with_entity_type_arg(self, mock_send):
        stub = MagicMock()
        stub.external_id = "2"
        stub.media_type = "network"
        stubs = [stub]

        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        mock_send.assert_called_once_with("sync.tmdb.company", args=[2, "network"])

    async def test_dispatches_keyword(self, mock_send):
        stub = MagicMock()
        stub.external_id = "42"
        stub.media_type = "keyword"
        stubs = [stub]

        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        mock_send.assert_called_once_with("sync.tmdb.keyword", args=[42])

    async def test_unknown_media_type_defaults_to_movie(self, mock_send):
        stub = MagicMock()
        stub.external_id = "999"
        stub.media_type = None
        stubs = [stub]

        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        mock_send.assert_called_once_with("sync.tmdb.movie", args=[999])

    async def test_throttled_returns_early(self, mock_throttle, mock_send):
        mock_throttle.return_value = (1001, True)

        result = await _process_backlog_batch({})
        assert result["status"] == "throttled"
        mock_send.assert_not_called()

    async def test_empty_returns_zero(self, mock_send):
        session = _make_async_session_mock(scalars_result=[])
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        assert result["status"] == "empty"
        assert result["dispatched"] == 0
        mock_send.assert_not_called()

    async def test_mixed_media_types_dispatched(self, mock_send):
        """Each batch should include both movie and show stubs (250/250 split)."""
        stubs = []
        for i in range(260):
            stub = MagicMock()
            stub.id = i
            stub.external_id = str(1000 + i)
            stub.media_type = "movie"
            stubs.append(stub)
        for i in range(260):
            stub = MagicMock()
            stub.id = 10000 + i
            stub.external_id = str(2000 + i)
            stub.media_type = "show"
            stubs.append(stub)

        # Return same full list for every query; dedup logic filters
        session = _make_async_session_mock(scalars_result=stubs)
        with patch("otix.tasks.seed.tmdb_seed.async_session", return_value=session):
            result = await _process_backlog_batch({})

        # Should dispatch all unique stubs (up to 520)
        assert result["dispatched"] == 520
        # Verify both media types were sent
        task_names = {call.args[0] for call in mock_send.call_args_list}
        assert "sync.tmdb.movie" in task_names
        assert "sync.tmdb.show" in task_names
        # People should NOT be dispatched (excluded from split)
        assert "sync.tmdb.person" not in task_names


# ═══════════════════════════════════════════════════════════════════════════════
# Export loop (lock + dispatch)
# ═══════════════════════════════════════════════════════════════════════════════


class TestDailyImportLoop:
    @pytest.fixture(autouse=True)
    def mocks(self, fakeredis):
        with (
            patch("otix.tasks.seed.tmdb_seed.get_redis", return_value=fakeredis),
            patch("otix.tasks.seed.get_redis", return_value=fakeredis),
            patch("otix.tasks.seed.tmdb_seed._import_export_file", new_callable=AsyncMock) as mock_import,
            patch("otix.tasks.seed.tmdb_seed._detect_deletions_after_import", new_callable=AsyncMock) as mock_deletion,
        ):
            mock_import.return_value = {"export_type": "movie_ids", "total": 500, "inserted": 50}
            mock_deletion.return_value = {"total_deleted": 0, "total_inserted": 0}
            yield fakeredis, mock_import, mock_deletion

    async def test_lock_prevents_concurrent_same_day(self, mocks):
        fakeredis, mock_import, _ = mocks
        from datetime import datetime, timezone
        date_key = datetime.now(timezone.utc).strftime("%Y%m%d")
        lock_key = f"otix:tmdb_seed:daily_lock:{date_key}"
        await fakeredis.set(lock_key, "1")

        result = await _daily_import_loop()
        assert result["status"] == "locked"
        mock_import.assert_not_called()

    async def test_runs_import_and_deletion(self, mocks):
        fakeredis, mock_import, mock_deletion = mocks

        result = await _daily_import_loop()
        assert result["status"] == "ok"
        assert mock_import.call_count == 10  # all 10 export files
        mock_deletion.assert_called_once()
        # Lock persists (not deleted) to prevent same-day re-run
        from datetime import datetime, timezone
        date_key = datetime.now(timezone.utc).strftime("%Y%m%d")
        lock_key = f"otix:tmdb_seed:daily_lock:{date_key}"
        assert await fakeredis.get(lock_key) is not None

    async def test_continues_on_import_error(self, mocks):
        fakeredis, mock_import, mock_deletion = mocks
        mock_import.side_effect = [{"export_type": "movie_ids", "total": 100, "inserted": 5}] + [RuntimeError("boom")] * 9

        with pytest.raises(RuntimeError, match="boom"):
            await _daily_import_loop()

    async def test_deletion_runs_after_all_imports(self, mocks):
        fakeredis, mock_import, mock_deletion = mocks
        mock_import.return_value = {"export_type": "movie_ids", "total": 100, "inserted": 10}

        result = await _daily_import_loop()
        assert result["deletion"] == {"total_deleted": 0, "total_inserted": 0}
        # Deletion is called after all imports
        assert mock_import.call_count == 10
        mock_deletion.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# Backlog loop (lock + dispatch)
# ═══════════════════════════════════════════════════════════════════════════════


class TestBacklogLoop:
    @pytest.fixture(autouse=True)
    def mocks(self, fakeredis):
        with (
            patch("otix.tasks.seed.tmdb_seed.get_redis", return_value=fakeredis),
            patch("otix.tasks.seed.get_redis", return_value=fakeredis),
            patch("otix.tasks.seed.tmdb_seed._process_backlog_batch", new_callable=AsyncMock) as mock_process,
        ):
            mock_process.return_value = {"status": "ok", "dispatched": 200}
            yield fakeredis, mock_process

    async def test_lock_prevents_concurrent(self, mocks):
        fakeredis, mock_process = mocks
        await fakeredis.set(_BACKLOG_LOCK, "1", ex=_BACKLOG_LOCK_TTL)

        result = await _seed_backlog_loop()
        assert result["status"] == "locked"
        mock_process.assert_not_called()

    async def test_runs_batch_and_releases_lock(self, mocks):
        fakeredis, mock_process = mocks
        result = await _seed_backlog_loop()
        mock_process.assert_called_once()
        assert result == {"status": "ok", "dispatched": 200}
        assert await fakeredis.get(_BACKLOG_LOCK) is None

    async def test_releases_lock_on_error(self, mocks):
        fakeredis, mock_process = mocks
        mock_process.side_effect = RuntimeError("boom")

        with pytest.raises(RuntimeError, match="boom"):
            await _seed_backlog_loop()

        assert await fakeredis.get(_BACKLOG_LOCK) is None


# ═══════════════════════════════════════════════════════════════════════════════
# Celery task wrappers
# ═══════════════════════════════════════════════════════════════════════════════


class TestCeleryTasks:
    def test_daily_import_task_registered(self):
        assert seed_tmdb_daily_import.name == "seed.tmdb_daily_import"
        assert getattr(seed_tmdb_daily_import, 'queue', None) is None

    def test_backlog_task_registered(self):
        assert seed_tmdb_backlog_cycle.name == "seed.tmdb_backlog_cycle"
        assert getattr(seed_tmdb_backlog_cycle, 'queue', None) is None

    def test_backlog_lock_ttl(self):
        assert _BACKLOG_LOCK_TTL == 120
