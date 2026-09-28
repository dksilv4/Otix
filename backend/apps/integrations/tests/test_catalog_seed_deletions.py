"""Tests for the TMDB daily upstream-deletion scan (increment 52).

``detect_tmdb_deletions`` is the reverse half of the inc-48 daily import: it
records tmdb ``ExternalID`` rows whose id today's official ``movie_ids`` /
``tv_series_ids`` dump no longer lists as ``TMDBDeletedID`` rows, so sync never
recreates an upstream-deleted title. The async orchestrator reads candidate rows
and writes the deleted records on worker threads via ``sync_to_async`` — writes
that would escape ``TestCase`` rollback — so, like the daily/popular feeder
tests, the orchestrator is asserted with its sync DB helpers patched, and the
rollback-safe sync helpers (``_mapped_tmdb_rows`` / ``_record_deleted``) are
exercised against the real test DB directly.
"""

from __future__ import annotations

import asyncio
import gzip
import os
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.integrations.services import catalog_seed
from apps.media.models import ExternalID, MediaItem
from apps.proposals.models import TMDBDeletedID


def _run(coro):
    return asyncio.run(coro)


def _export_file(ids: list[int]) -> Path:
    fd, name = tempfile.mkstemp(suffix=".json.gz")
    os.close(fd)
    path = Path(name)
    body = "[\n" + "".join(f'{{"id": {i}, "original_title": "T{i}"}},\n' for i in ids) + "]"
    path.write_bytes(gzip.compress(body.encode("utf-8")))
    return path


def _movie_row(external_id: str, *, title: str = "Gone") -> tuple[int, int, str]:
    media = MediaItem.objects.create(
        media_type="movie", title=title, slug=title.lower().replace(" ", "-")
    )
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        provider="tmdb",
        external_id=external_id,
        media_type="movie",
        object_id=media.pk,
    )
    return media.pk


class DetectTmdbDeletionsTests(TestCase):
    def test_records_only_ids_missing_from_the_export(self):
        with (
            mock.patch.object(
                catalog_seed,
                "_mapped_tmdb_rows",
                return_value=[
                    ("11", 100, "One"),
                    ("12", 200, "Two"),
                    ("13", 300, "Three"),
                ],
            ) as rows,
            mock.patch.object(
                catalog_seed, "download_tmdb_export", new=mock.AsyncMock()
            ) as download,
            mock.patch.object(catalog_seed, "_record_deleted", return_value=1) as record,
        ):
            path = _export_file([11, 13])
            download.return_value = path
            try:
                summary = _run(catalog_seed.detect_tmdb_deletions("movie"))
            finally:
                path.unlink(missing_ok=True)

        rows.assert_called_once_with("movie")
        download.assert_awaited_once()
        record.assert_called_once_with("movie", [(12, (200, "Two"))])
        self.assertEqual(summary["deleted"], 1)
        self.assertEqual(summary["recorded"], 1)

    def test_no_mapped_rows_skips_the_download(self):
        with (
            mock.patch.object(catalog_seed, "_mapped_tmdb_rows", return_value=[]) as rows,
            mock.patch.object(
                catalog_seed, "download_tmdb_export", new=mock.AsyncMock()
            ) as download,
        ):
            summary = _run(catalog_seed.detect_tmdb_deletions("movie"))

        rows.assert_called_once_with("movie")
        download.assert_not_awaited()
        self.assertEqual(summary["deleted"], 0)
        self.assertEqual(summary["recorded"], 0)

    def test_unavailable_export_is_reported_not_raised(self):
        with (
            mock.patch.object(catalog_seed, "_mapped_tmdb_rows", return_value=[("5", None, None)]),
            mock.patch.object(
                catalog_seed,
                "download_tmdb_export",
                new=mock.AsyncMock(return_value=None),
            ) as download,
            mock.patch.object(catalog_seed, "_record_deleted") as record,
        ):
            summary = _run(catalog_seed.detect_tmdb_deletions("movie"))

        download.assert_awaited_once()
        record.assert_not_called()
        self.assertEqual(summary["export"], "unavailable")
        self.assertEqual(summary["deleted"], 0)

    def test_unsupported_entity_type_raises(self):
        with self.assertRaisesMessage(ValueError, "only covers movie/show"):
            _run(catalog_seed.detect_tmdb_deletions("game"))

    def test_scan_wrapper_runs_movie_then_show(self):
        summaries = {
            "movie": {"entity_type": "movie", "deleted": 1},
            "show": {"entity_type": "show", "deleted": 0},
        }
        with mock.patch.object(
            catalog_seed,
            "detect_tmdb_deletions",
            new=mock.AsyncMock(side_effect=lambda et: summaries[et]),
        ) as detect:
            result = catalog_seed.run_tmdb_deletion_scan()

        self.assertEqual([c.args[0] for c in detect.await_args_list], ["movie", "show"])
        self.assertEqual(result, summaries)


class MappedRowsAndRecordDeletedTests(TestCase):
    def test_mapped_rows_only_includes_the_entity_type(self):
        movie_pk = _movie_row("42", title="Gone")
        _movie_row("not-an-int", title="Skip")
        _movie_row("x", title="NoInt")

        rows = catalog_seed._mapped_tmdb_rows("movie")
        self.assertEqual(len(rows), 3)
        self.assertIn("42", [r[0] for r in rows])
        self.assertEqual(catalog_seed._mapped_tmdb_rows("show"), [])

        self.assertIsNotNone(MediaItem.objects.get(pk=movie_pk))

    def test_record_deleted_persists_idempotently(self):
        media_pk = _movie_row("999", title="Gone")

        first = catalog_seed._record_deleted("movie", [(999, (media_pk, "Gone"))])
        self.assertEqual(first, 1)
        row = TMDBDeletedID.objects.get(tmdb_id=999, media_type="movie")
        self.assertEqual(row.title, "Gone")
        self.assertEqual(row.media_item_id, media_pk)

        second = catalog_seed._record_deleted("movie", [(999, (None, None))])
        self.assertEqual(second, 0)
        self.assertEqual(TMDBDeletedID.objects.filter(tmdb_id=999).count(), 1)
