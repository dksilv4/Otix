"""Tests for catalog seeding pipeline — three concurrent seeders.

Covers: state helpers, progress reporting, TMDB people export/batch,
Steam app list download/batch, IGDB offset batch, seed_loop with locks,
and Celery task wrappers.
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

import otix.tasks.seed.catalog_seed as cs
from otix.tasks.seed.catalog_seed import (
    BATCH_ENTRIES,
    IGDB_LIMIT,
    IGDB_PAGES_PER_CYCLE,
    LOCK_TTL,
    SEEN_TTL,
    _IGDB_LOCK,
    _IGDB_SEEN,
    _IGDB_STATE,
    _PEOPLE_LOCK,
    _PEOPLE_SEEN,
    _PEOPLE_STATE,
    _STEAM_LOCK,
    _STEAM_SEEN,
    _STEAM_STATE,
    _clear_seen,
    _download_export,
    _download_steam_app_list,
    _enqueue_if_new,
    _load_state,
    _log_overall_summary,
    _log_progress,
    _process_igdb_batch,
    _process_people_batch,
    _process_steam_batch,
    _save_state,
    _seed_loop,
    seed_igdb_cycle,
    seed_people_cycle,
    seed_steam_cycle,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _make_tmdb_gzip(entries: list[dict]) -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json.gz", prefix="otix_test_")
    with gzip.open(tmp.name, "wt", encoding="utf-8") as f:
        f.write("[\n")
        for i, entry in enumerate(entries):
            line = json.dumps(entry)
            if i < len(entries) - 1:
                line += ","
            f.write(line + "\n")
        f.write("{}\n")
        f.write("]\n")
    tmp.close()
    return Path(tmp.name)


def _make_steam_json(apps: list[dict], have_more: bool = False, last_appid: int = 0) -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", prefix="otix_test_steam_")
    with open(tmp.name, "w", encoding="utf-8") as f:
        json.dump({"response": {"apps": apps, "have_more_results": have_more, "last_appid": last_appid or apps[-1]["appid"] if apps else 0}}, f)
    tmp.close()
    return Path(tmp.name)


# ═══════════════════════════════════════════════════════════════════════════════
# State helpers
# ═══════════════════════════════════════════════════════════════════════════════


class TestLoadSaveState:
    async def test_load_returns_default_when_no_state(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            state = await _load_state(_PEOPLE_STATE, {"status": "new"})
        assert state == {"status": "new"}

    async def test_save_and_load_roundtrip(self, fakeredis):
        state = {"file_path": "/tmp/test.gz", "entries_processed": 1000}
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            await _save_state(_PEOPLE_STATE, state)
            loaded = await _load_state(_PEOPLE_STATE)
        assert loaded == state

    async def test_load_handles_corrupt_json(self, fakeredis):
        await fakeredis.set(_PEOPLE_STATE, "not valid json{{{")
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            state = await _load_state(_PEOPLE_STATE, {"fallback": True})
        assert state == {"fallback": True}

    async def test_seeders_have_independent_state(self, fakeredis):
        """Each seeder uses its own Redis key."""
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            await _save_state(_PEOPLE_STATE, {"entries_processed": 100})
            await _save_state(_STEAM_STATE, {"entries_processed": 200})
            await _save_state(_IGDB_STATE, {"offset": 300})

        p = await fakeredis.get(_PEOPLE_STATE)
        s = await fakeredis.get(_STEAM_STATE)
        i = await fakeredis.get(_IGDB_STATE)

        assert "100" in p
        assert "200" in s
        assert "300" in i


# ═══════════════════════════════════════════════════════════════════════════════
# Dedup helpers
# ═══════════════════════════════════════════════════════════════════════════════


class TestEnqueueIfNew:
    async def test_enqueues_new_id(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch.object(cs.app, "send_task") as mock_send:
                result = await _enqueue_if_new(_PEOPLE_SEEN, "sync.tmdb.person", 287)

        assert result is True
        mock_send.assert_called_once_with("sync.tmdb.person", args=[287])
        assert await fakeredis.sismember(_PEOPLE_SEEN, "287")

    async def test_skips_duplicate_id(self, fakeredis):
        await fakeredis.sadd(_PEOPLE_SEEN, "287")
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch.object(cs.app, "send_task") as mock_send:
                result = await _enqueue_if_new(_PEOPLE_SEEN, "sync.tmdb.person", 287)

        assert result is False
        mock_send.assert_not_called()

    async def test_sets_ttl_on_first_add(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch.object(cs.app, "send_task"):
                await _enqueue_if_new(_STEAM_SEEN, "sync.steam.update_app", 10)
        ttl = await fakeredis.ttl(_STEAM_SEEN)
        assert ttl > 0
        assert ttl <= SEEN_TTL

    async def test_seeders_have_independent_seen_sets(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch.object(cs.app, "send_task"):
                await _enqueue_if_new(_PEOPLE_SEEN, "sync.tmdb.person", 1)
                await _enqueue_if_new(_STEAM_SEEN, "sync.steam.update_app", 1)

        assert await fakeredis.sismember(_PEOPLE_SEEN, "1")
        assert await fakeredis.sismember(_STEAM_SEEN, "1")


class TestClearSeen:
    async def test_deletes_seen_set(self, fakeredis):
        await fakeredis.sadd(_PEOPLE_SEEN, "1", "2", "3")
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            await _clear_seen(_PEOPLE_SEEN)
        assert await fakeredis.exists(_PEOPLE_SEEN) == 0

    async def test_clear_empty_set_noop(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            await _clear_seen(_PEOPLE_SEEN)


# ═══════════════════════════════════════════════════════════════════════════════
# Progress reporting
# ═══════════════════════════════════════════════════════════════════════════════


class TestLogProgress:
    async def test_people_log(self):
        state = {"entries_processed": 1500}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("people", state)
        msg = mock_log.call_args[0][0]
        assert "seed.people" in msg
        assert "processed=1500" in msg

    async def test_with_cycle_result(self):
        state = {"entries_processed": 500}
        result = {"enqueued": 500}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("steam", state, cycle_result=result)
        msg = mock_log.call_args[0][0]
        assert "enqueued=500" in msg

    async def test_with_skipped(self):
        state = {"entries_processed": 500}
        result = {"enqueued": 400, "skipped": 100}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("people", state, cycle_result=result)
        msg = mock_log.call_args[0][0]
        assert "enqueued=400" in msg
        assert "skipped=100" in msg

    async def test_done_status(self):
        state = {"entries_processed": 1000, "pipeline": "done"}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("people", state)
        msg = mock_log.call_args[0][0]
        assert "done" in msg
        assert "running" not in msg

    async def test_running_status(self):
        state = {"entries_processed": 500}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("steam", state)
        msg = mock_log.call_args[0][0]
        assert "running" in msg

    async def test_with_error(self):
        state = {"entries_processed": 0}
        result = {"error": "batch_failed"}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("igdb", state, cycle_result=result)
        msg = mock_log.call_args[0][0]
        assert "batch_failed" in msg

    async def test_with_percentage(self):
        state = {"entries_processed": 7500, "total": 10000}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("steam", state)
        msg = mock_log.call_args[0][0]
        assert "7500/10000" in msg
        assert "75.0%" in msg

    async def test_igdb_log(self):
        state = {"offset": 150}
        with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
            _log_progress("igdb", state)
        msg = mock_log.call_args[0][0]
        assert "seed.igdb" in msg
        assert "processed=150" in msg


# ═══════════════════════════════════════════════════════════════════════════════
# Overall summary
# ═══════════════════════════════════════════════════════════════════════════════


class TestLogOverallSummary:
    async def test_all_running(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
                await _log_overall_summary()

        msg = mock_log.call_args[0][0]
        assert "seed.overall" in msg
        assert "0/4 done" in msg
        assert "people:" in msg
        assert "steam:" in msg
        assert "igdb:" in msg
        assert "musicbrainz:" in msg
        assert "running" in msg

    async def test_one_done(self, fakeredis):
        await fakeredis.set(_PEOPLE_STATE, json.dumps({"entries_processed": 2000, "pipeline": "done"}))
        await fakeredis.set(_STEAM_STATE, json.dumps({"entries_processed": 500, "total": 1000}))
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
                await _log_overall_summary()

        msg = mock_log.call_args[0][0]
        assert "1/4 done" in msg
        assert "people: 2000 [done]" in msg
        assert "steam: 500/1000 (50.0%) [running]" in msg

    async def test_all_done(self, fakeredis):
        await fakeredis.set(_PEOPLE_STATE, json.dumps({"entries_processed": 2000, "pipeline": "done"}))
        await fakeredis.set(_STEAM_STATE, json.dumps({"entries_processed": 1000, "pipeline": "done"}))
        await fakeredis.set(_IGDB_STATE, json.dumps({"offset": 5000, "pipeline": "done"}))
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            with patch("otix.tasks.seed.catalog_seed.logger.info") as mock_log:
                await _log_overall_summary()

        msg = mock_log.call_args[0][0]
        assert "3/4 done" in msg


# ═══════════════════════════════════════════════════════════════════════════════
# TMDB export download
# ═══════════════════════════════════════════════════════════════════════════════


class TestDownloadExport:
    async def test_download_success(self):
        gz_data = gzip.compress(b'[{"id":1},{"id":2}]')

        class OKTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(200, content=gz_data, request=request)

        async with httpx.AsyncClient(transport=OKTransport()) as client:
            with patch("otix.tasks.seed.catalog_seed.httpx.AsyncClient") as mock_cls:
                mock_cls.return_value.__aenter__.return_value = client
                mock_cls.return_value.__aexit__.return_value = None
                path = await _download_export("person_ids")

        assert path is not None
        assert path.exists()
        try:
            os.unlink(path)
        except OSError:
            pass

    async def test_404_fallback(self):
        call_count = 0

        class FallbackTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return httpx.Response(404, content=b"{}", request=request)
                return httpx.Response(200, content=gzip.compress(b'[{"id":1}]'), request=request)

        async with httpx.AsyncClient(transport=FallbackTransport()) as client:
            with patch("otix.tasks.seed.catalog_seed.httpx.AsyncClient") as mock_cls:
                mock_cls.return_value.__aenter__.return_value = client
                mock_cls.return_value.__aexit__.return_value = None
                path = await _download_export("person_ids")

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
            with patch("otix.tasks.seed.catalog_seed.httpx.AsyncClient") as mock_cls:
                mock_cls.return_value.__aenter__.return_value = client
                mock_cls.return_value.__aexit__.return_value = None
                path = await _download_export("person_ids")

        assert path is None

    async def test_http_error_cleans_up(self):
        class ErrorTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(500, content=b"error", request=request)

        async with httpx.AsyncClient(transport=ErrorTransport()) as client:
            with patch("otix.tasks.seed.catalog_seed.httpx.AsyncClient") as mock_cls:
                mock_cls.return_value.__aenter__.return_value = client
                mock_cls.return_value.__aexit__.return_value = None
                with pytest.raises(Exception):
                    await _download_export("person_ids")


# ═══════════════════════════════════════════════════════════════════════════════
# TMDB People batch
# ═══════════════════════════════════════════════════════════════════════════════


class TestProcessPeopleBatch:
    @pytest.fixture(autouse=True)
    def mock_backlog(self):
        with patch("otix.tasks.seed.catalog_seed._check_fast_queue_backlog", new_callable=AsyncMock) as m:
            m.return_value = (0, False)
            yield m

    @pytest.fixture(autouse=True)
    def mock_save(self):
        with patch("otix.tasks.seed.catalog_seed._save_state", new_callable=AsyncMock):
            yield

    @pytest.fixture(autouse=True)
    def mock_clear(self):
        with patch("otix.tasks.seed.catalog_seed._clear_seen", new_callable=AsyncMock) as m:
            yield m

    @pytest.fixture
    def mock_enqueue(self):
        with patch("otix.tasks.seed.catalog_seed._enqueue_if_new", new_callable=AsyncMock) as m:
            m.return_value = True
            yield m

    @pytest.fixture
    def mock_download(self):
        with patch("otix.tasks.seed.catalog_seed._download_export") as mock:
            yield mock

    @pytest.fixture
    def person_entries(self):
        return [{"id": i, "name": f"Person {i}"} for i in range(1, 11)]

    async def test_first_batch_exhausts_small_file(self, mock_enqueue, mock_clear, person_entries):
        gz_path = _make_tmdb_gzip(person_entries)
        state = {"file_path": str(gz_path), "entries_processed": 0}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        assert result["enqueued"] == 10
        assert result.get("skipped", 0) == 0
        assert mock_enqueue.call_count == 10
        mock_enqueue.assert_any_call(_PEOPLE_SEEN, "sync.tmdb.person", 1)
        assert state.get("pipeline") == "done"
        mock_clear.assert_called_once_with(_PEOPLE_SEEN)

    async def test_resumes_from_offset(self, mock_enqueue, person_entries):
        gz_path = _make_tmdb_gzip(person_entries)
        state = {"file_path": str(gz_path), "entries_processed": 5}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        assert result["enqueued"] == 5
        ids = [call.args[2] for call in mock_enqueue.call_args_list]
        assert ids == [6, 7, 8, 9, 10]

    async def test_export_unavailable(self, mock_download, mock_clear):
        mock_download.return_value = None
        state = {}

        result = await _process_people_batch(state)
        assert result["status"] == "export_unavailable"

    async def test_stale_file_re_downloads(self, mock_enqueue, mock_download, person_entries):
        gz_path = _make_tmdb_gzip(person_entries)
        mock_download.return_value = gz_path
        state = {"file_path": "/nonexistent/stale.gz", "entries_processed": 0}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        mock_download.assert_called_once_with("person_ids")
        assert result["enqueued"] == 10

    async def test_skips_invalid_json(self, mock_enqueue):
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

        state = {"file_path": str(gz_path), "entries_processed": 0}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        assert result["enqueued"] == 2

    async def test_batch_entries_limit(self, mock_enqueue):
        entries = [{"id": i} for i in range(1, 800)]
        gz_path = _make_tmdb_gzip(entries)
        state = {"file_path": str(gz_path), "entries_processed": 0}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        assert mock_enqueue.call_count == BATCH_ENTRIES
        assert result["entries_processed"] == BATCH_ENTRIES

    async def test_handles_duplicates(self, mock_enqueue, person_entries):
        """When _enqueue_if_new returns False, IDs count as skipped."""
        mock_enqueue.side_effect = lambda *a, **kw: int(a[2]) % 2 == 1  # odd = new, even = skip
        gz_path = _make_tmdb_gzip(person_entries)
        state = {"file_path": str(gz_path), "entries_processed": 0}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        assert result["enqueued"] == 5  # 1, 3, 5, 7, 9
        assert result["skipped"] == 5   # 2, 4, 6, 8, 10

    async def test_missing_id_field_skipped(self, mock_enqueue, mock_clear):
        entries = [{"name": "No ID"}, {"id": 1}]
        gz_path = _make_tmdb_gzip(entries)
        state = {"file_path": str(gz_path), "entries_processed": 0}

        try:
            result = await _process_people_batch(state)
        finally:
            try:
                os.unlink(gz_path)
            except OSError:
                pass

        assert mock_enqueue.call_count == 1
        assert result["enqueued"] == 1

    async def test_batch_error_preserves_state(self, mock_enqueue):
        """When reading fails mid-batch, the state is preserved so next cycle retries."""
        entries = [{"id": 1}, {"id": 2}]
        gz_path = _make_tmdb_gzip(entries)

        # Corrupt the file after first entry to trigger error
        original_open = gzip.open

        class FailingFile:
            def __init__(self, *args, **kwargs):
                self._f = original_open(*args, **kwargs)
                self._lines_read = 0

            def __iter__(self):
                return self

            def __next__(self):
                line = next(self._f)
                self._lines_read += 1
                if self._lines_read > 3:  # After header + 2 entries
                    raise OSError("simulated read error")
                return line

            def __enter__(self):
                return self

            def __exit__(self, *args):
                self._f.__exit__(*args)

        state = {"file_path": str(gz_path), "entries_processed": 0}

        with patch("otix.tasks.seed.catalog_seed.gzip.open", return_value=FailingFile(str(gz_path), "rt", encoding="utf-8")):
            result = await _process_people_batch(state)

        assert result["error"] == "batch_failed"
        try:
            os.unlink(gz_path)
        except OSError:
            pass


# ═══════════════════════════════════════════════════════════════════════════════
# Steam download
# ═══════════════════════════════════════════════════════════════════════════════


class TestDownloadSteamAppList:
    @pytest.fixture(autouse=True)
    def mock_api_key(self):
        with patch("otix.infrastructure.config.settings.steam_api_key", "test_key"):
            yield

    async def test_download_success(self):
        data = json.dumps({"response": {"apps": [{"appid": 10}, {"appid": 20}], "have_more_results": False, "last_appid": 20}})

        class OKTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(200, content=data.encode(), request=request)

        async with httpx.AsyncClient(transport=OKTransport()) as client:
            with patch("otix.tasks.seed.catalog_seed.httpx.AsyncClient") as mock_cls:
                mock_cls.return_value.__aenter__.return_value = client
                mock_cls.return_value.__aexit__.return_value = None
                path = await _download_steam_app_list()

        assert path is not None
        assert path.exists()
        try:
            os.unlink(path)
        except OSError:
            pass

    async def test_error_cleans_up(self):
        class ErrorTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                raise httpx.ConnectError("connection refused")

        async with httpx.AsyncClient(transport=ErrorTransport()) as client:
            with patch("otix.tasks.seed.catalog_seed.httpx.AsyncClient") as mock_cls:
                mock_cls.return_value.__aenter__.return_value = client
                mock_cls.return_value.__aexit__.return_value = None
                with pytest.raises(Exception):
                    await _download_steam_app_list()


# ═══════════════════════════════════════════════════════════════════════════════
# Steam batch
# ═══════════════════════════════════════════════════════════════════════════════


class TestProcessSteamBatch:
    @pytest.fixture(autouse=True)
    def mock_save(self):
        with patch("otix.tasks.seed.catalog_seed._save_state", new_callable=AsyncMock):
            yield

    @pytest.fixture(autouse=True)
    def mock_clear(self):
        with patch("otix.tasks.seed.catalog_seed._clear_seen", new_callable=AsyncMock) as m:
            yield m

    @pytest.fixture
    def mock_enqueue(self):
        with patch("otix.tasks.seed.catalog_seed._enqueue_if_new", new_callable=AsyncMock) as m:
            m.return_value = True
            yield m

    @pytest.fixture
    def mock_download(self):
        with patch("otix.tasks.seed.catalog_seed._download_steam_app_list") as mock:
            yield mock

    async def test_first_batch_exhausts_small_file(self, mock_enqueue, mock_clear):
        apps = [{"appid": i, "name": f"Game {i}"} for i in range(1, 11)]
        json_path = _make_steam_json(apps)
        state = {"file_path": str(json_path), "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        assert result["enqueued"] == 10
        assert result.get("skipped", 0) == 0
        assert mock_enqueue.call_count == 10
        mock_enqueue.assert_any_call(_STEAM_SEEN, "sync.steam.update_app", 1)
        assert state.get("pipeline") == "done"
        assert result["entries_processed"] == 10
        mock_clear.assert_called_once_with(_STEAM_SEEN)

    async def test_resumes_from_offset(self, mock_enqueue):
        apps = [{"appid": i} for i in range(1, 11)]
        json_path = _make_steam_json(apps)
        state = {"file_path": str(json_path), "page_offset": 5, "entries_processed": 5}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        assert result["enqueued"] == 5
        ids = [call.args[2] for call in mock_enqueue.call_args_list]
        assert ids == [6, 7, 8, 9, 10]

    async def test_unavailable_skips(self, mock_download, mock_clear):
        mock_download.return_value = None
        state = {}

        result = await _process_steam_batch(state)
        assert result["pipeline"] == "done"

    async def test_empty_app_list(self, mock_enqueue, mock_clear):
        json_path = _make_steam_json([])
        state = {"file_path": str(json_path), "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        assert result["enqueued"] == 0
        assert state.get("pipeline") == "done"

    async def test_stale_file_re_downloads(self, mock_enqueue, mock_download):
        apps = [{"appid": 1}]
        json_path = _make_steam_json(apps)
        mock_download.return_value = json_path
        state = {"file_path": "/nonexistent/stale.json", "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        mock_download.assert_called_once()
        assert result["enqueued"] == 1

    async def test_batch_entries_limit(self, mock_enqueue):
        apps = [{"appid": i} for i in range(1, 800)]
        json_path = _make_steam_json(apps)
        state = {"file_path": str(json_path), "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        assert mock_enqueue.call_count == BATCH_ENTRIES
        assert result["entries_processed"] == BATCH_ENTRIES

    async def test_duplicates_tracked_as_skipped(self, mock_enqueue):
        """When _enqueue_if_new returns False, count as skipped."""
        mock_enqueue.return_value = False
        apps = [{"appid": i} for i in range(1, 6)]
        json_path = _make_steam_json(apps)
        state = {"file_path": str(json_path), "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        assert result["enqueued"] == 0
        assert result["skipped"] == 5

    async def test_ignores_non_dict_entries(self, mock_enqueue, mock_clear):
        apps = [{"appid": 1}, "not_a_dict", {"appid": 2}]
        json_path = _make_steam_json(apps)
        state = {"file_path": str(json_path), "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(json_path)
            except OSError:
                pass

        assert mock_enqueue.call_count == 2

    async def test_batch_error_preserves_state(self, mock_enqueue):
        """When JSON is corrupt, error is returned with progress so far."""
        # Create a real file with invalid JSON so the stale-file check passes
        # and we don't trigger _download_steam_app_list
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", prefix="otix_test_bad_steam_")
        tmp.write(b"not valid json {{{")
        tmp.close()
        state = {"file_path": tmp.name, "entries_processed": 0}

        try:
            result = await _process_steam_batch(state)
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

        assert result["error"] == "batch_failed"


# ═══════════════════════════════════════════════════════════════════════════════
# IGDB batch
# ═══════════════════════════════════════════════════════════════════════════════


class TestProcessIGDBBatch:
    @pytest.fixture(autouse=True)
    def mock_save(self):
        with patch("otix.tasks.seed.catalog_seed._save_state", new_callable=AsyncMock):
            yield

    @pytest.fixture(autouse=True)
    def mock_clear(self):
        with patch("otix.tasks.seed.catalog_seed._clear_seen", new_callable=AsyncMock) as m:
            yield m

    @pytest.fixture
    def mock_enqueue(self):
        with patch("otix.tasks.seed.catalog_seed._enqueue_if_new", new_callable=AsyncMock) as m:
            m.return_value = True
            yield m

    @pytest.fixture
    def mock_igdb_provider(self):
        with patch("otix.providers.igdb.client.IGDBProvider") as mock_cls:
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance
            yield mock_instance

    @pytest.fixture
    def mock_redis(self, fakeredis):
        with patch("otix.infrastructure.redis.get_redis", return_value=fakeredis):
            yield

    @pytest.fixture
    def mock_sleep(self):
        with patch("otix.tasks.seed.catalog_seed.asyncio.sleep", new_callable=AsyncMock) as m:
            yield m

    async def test_single_page(self, mock_enqueue, mock_igdb_provider, mock_redis, mock_sleep):
        results = [{"id": i} for i in range(1, 51)]
        mock_igdb_provider.get_games_offset.side_effect = [results, [], []]
        state = {"offset": 0}

        result = await _process_igdb_batch(state)

        assert result["enqueued"] == 50
        assert result["skipped"] == 0
        assert mock_enqueue.call_count == 50
        assert result["offset"] == 50

    async def test_multiple_pages(self, mock_enqueue, mock_igdb_provider, mock_redis, mock_sleep):
        p1 = [{"id": i} for i in range(1, 51)]
        p2 = [{"id": i} for i in range(51, 101)]
        p3 = [{"id": i} for i in range(101, 151)]
        mock_igdb_provider.get_games_offset.side_effect = [p1, p2, p3]
        state = {"offset": 0}

        result = await _process_igdb_batch(state)

        assert result["enqueued"] == 150
        assert result["offset"] == 150
        assert mock_enqueue.call_count == 150

    async def test_empty_results_sets_done(self, mock_igdb_provider, mock_redis, mock_sleep, mock_clear):
        mock_igdb_provider.get_games_offset.return_value = []
        state = {"offset": 500}

        result = await _process_igdb_batch(state)

        assert result["enqueued"] == 0
        assert state["pipeline"] == "done"
        mock_clear.assert_called_once_with(_IGDB_SEEN)

    async def test_error_breaks_loop(self, mock_enqueue, mock_igdb_provider, mock_redis, mock_sleep):
        p1 = [{"id": 1}, {"id": 2}]
        mock_igdb_provider.get_games_offset.side_effect = [p1, Exception("API error")]
        state = {"offset": 0}

        result = await _process_igdb_batch(state)

        assert result["enqueued"] == 2
        assert result["offset"] == 2

    async def test_respects_rate_limit(self, mock_enqueue, mock_igdb_provider, mock_redis, mock_sleep):
        mock_igdb_provider.get_games_offset.return_value = [{"id": 1}]
        state = {"offset": 0}

        await _process_igdb_batch(state)

        assert mock_sleep.call_count == IGDB_PAGES_PER_CYCLE

    async def test_duplicates_tracked_as_skipped(self, mock_enqueue, mock_igdb_provider, mock_redis, mock_sleep):
        mock_enqueue.return_value = False
        results = [{"id": 1}, {"id": 2}]
        mock_igdb_provider.get_games_offset.side_effect = [results, []]
        state = {"offset": 0}

        result = await _process_igdb_batch(state)

        assert result["enqueued"] == 0
        assert result["skipped"] == 2

    async def test_skips_none_id(self, mock_enqueue, mock_igdb_provider, mock_redis, mock_sleep):
        results = [{"id": None}, {"id": 1}, {"name": "no id"}]
        mock_igdb_provider.get_games_offset.side_effect = [results, []]
        state = {"offset": 0}

        result = await _process_igdb_batch(state)

        assert mock_enqueue.call_count == 1
        mock_enqueue.assert_called_once_with(_IGDB_SEEN, "sync.igdb.game", 1)


# ═══════════════════════════════════════════════════════════════════════════════
# Seed loop (lock + dispatch)
# ═══════════════════════════════════════════════════════════════════════════════


class TestSeedLoop:
    @pytest.fixture
    def mock_redis(self, fakeredis):
        with patch("otix.tasks.seed.catalog_seed.get_redis", return_value=fakeredis):
            yield fakeredis

    @pytest.fixture
    def mock_process(self):
        return AsyncMock(return_value={"enqueued": 10})

    async def test_lock_prevents_concurrent(self, mock_redis, mock_process):
        await mock_redis.set(_PEOPLE_LOCK, "1", ex=LOCK_TTL)

        result = await _seed_loop("people", _PEOPLE_STATE, _PEOPLE_LOCK, mock_process)
        assert result["status"] == "locked"
        mock_process.assert_not_called()

    async def test_runs_batch_and_releases_lock(self, mock_redis, mock_process):
        await mock_redis.set(_PEOPLE_STATE, json.dumps({"entries_processed": 0}))

        result = await _seed_loop("people", _PEOPLE_STATE, _PEOPLE_LOCK, mock_process)
        mock_process.assert_called_once()
        assert result == {"enqueued": 10}
        assert await mock_redis.get(_PEOPLE_LOCK) is None

    async def test_done_state_returns_early(self, mock_redis, mock_process):
        await mock_redis.set(_PEOPLE_STATE, json.dumps({"pipeline": "done"}))

        result = await _seed_loop("people", _PEOPLE_STATE, _PEOPLE_LOCK, mock_process)
        assert result == {"pipeline": "done"}
        mock_process.assert_not_called()

    async def test_releases_lock_on_error(self, mock_redis, mock_process):
        await mock_redis.set(_STEAM_STATE, json.dumps({"entries_processed": 0}))
        mock_process.side_effect = RuntimeError("boom")

        with pytest.raises(RuntimeError, match="boom"):
            await _seed_loop("steam", _STEAM_STATE, _STEAM_LOCK, mock_process)

        assert await mock_redis.get(_STEAM_LOCK) is None

    async def test_seeders_independent_locks(self, mock_redis, mock_process):
        """Locking one seeder doesn't block another."""
        await mock_redis.set(_PEOPLE_LOCK, "1", ex=LOCK_TTL)
        await mock_redis.set(_STEAM_STATE, json.dumps({"entries_processed": 0}))

        result = await _seed_loop("steam", _STEAM_STATE, _STEAM_LOCK, mock_process)
        assert result == {"enqueued": 10}
        mock_process.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# Celery task wrappers
# ═══════════════════════════════════════════════════════════════════════════════


class TestCeleryTasks:
    def test_people_task_registered(self):
        assert seed_people_cycle.name == "seed.people_cycle"
        assert seed_people_cycle.queue == "default"

    def test_steam_task_registered(self):
        assert seed_steam_cycle.name == "seed.steam_cycle"
        assert seed_steam_cycle.queue == "default"

    def test_igdb_task_registered(self):
        assert seed_igdb_cycle.name == "seed.igdb_cycle"
        assert seed_igdb_cycle.queue == "default"
