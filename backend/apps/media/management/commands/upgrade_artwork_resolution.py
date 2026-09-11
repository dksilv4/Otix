"""Rewrite sized provider artwork URLs to max resolution.

Two phases so the bulk of the work can be parallelized:

1. Repoint sized provider URLs (TMDB ``w500``/``w780``, IGDB ``t_1080p``/...)
   to their max-res ``original`` variants in batched ``bulk_update`` writes.
2. Re-download the rows that have a local mirror at the new URL concurrently
   (the network is the slow part; a single-threaded pass over ~7.5k downloads
   would take hours).

Rows keep their existing mirror until a fresh copy lands, so an interrupted run
never orphans a served file: a failed download just leaves the old (low-res)
mirror in place for a later run or the periodic mirror sweep. Idempotent: URLs
already at max are skipped. ``--dry-run`` reports scope without touching the DB
or disk.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.media.models import MediaAsset
from apps.media.services import assets as assets_service

# TMDB: https://image.tmdb.org/t/p/w500/... -> /t/p/original/...
_TMDB_SIZED = re.compile(r"(https://image\.tmdb\.org/t/p/)w\d+(/)")
# IGDB: https://images.igdb.com/igdb/image/upload/t_1080p/... -> .../t_original/...
# (negative lookahead keeps already-original tokens untouched).
_IGDB_UPLOAD = re.compile(
    r"(https://images\.igdb\.com/igdb/image/upload/)(?!t_original/)[^/]+(/)"
)

_BULK_CHUNK = 2000
_DOWNLOAD_WORKERS = 8


def max_res_url(url: str) -> str:
    if not url:
        return url
    rewritten = _TMDB_SIZED.sub(r"\g<1>original\g<2>", url)
    rewritten = _IGDB_UPLOAD.sub(r"\g<1>t_original\g<2>", rewritten)
    return rewritten


def _remove_old_file(name: str) -> int:
    """Best-effort unlink of a stale mirror file; returns bytes removed."""
    if not name:
        return 0
    path = assets_service.asset_dir() / Path(name).name
    try:
        if path.is_file():
            size = path.stat().st_size
            path.unlink()
            return size
    except OSError:
        pass
    return 0


def _redownload_one(pk: int) -> tuple[int, int | None, int]:
    """Replace one mirrored row's local copy at its (now max-res) URL.

    Returns ``(pk, bytes_written, bytes_freed)`` where ``bytes_written`` is None
    when the download failed. The old mirror is kept until the fresh copy exists.
    """
    row = MediaAsset.objects.filter(pk=pk).first()
    if row is None:
        return pk, None, 0
    old_name = row.local_name
    # Detach in memory so download_asset doesn't short-circuit on the old file.
    row.local_name = None
    row.local_size = None
    row.downloaded_at = None
    written = assets_service.download_asset(row)
    freed = _remove_old_file(old_name) if written else 0
    return pk, written, freed


class Command(BaseCommand):
    help = "Rewrite sized TMDB/IGDB artwork URLs to max resolution (re-downloads mirrors)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Cap rewrites and mirror re-downloads at this many rows (default: all).",
        )
        parser.add_argument(
            "--workers",
            type=int,
            default=_DOWNLOAD_WORKERS,
            help="Concurrent mirror re-downloads (default: 8).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing the DB or disk.",
        )

    def handle(self, *args, **options) -> None:
        limit = options["limit"]
        workers = options["workers"]
        dry_run = options["dry_run"]

        rewritten = 0
        to_download: list[int] = []

        qs = MediaAsset.objects.exclude(url="").order_by("id")
        pending: list[MediaAsset] = []
        for asset in qs.iterator(chunk_size=5000):
            new_url = max_res_url(asset.url)
            if new_url == asset.url:
                continue
            if limit is not None and rewritten + len(pending) >= limit:
                break
            if dry_run:
                if rewritten < 10:
                    self.stdout.write(f"[dry-run] asset {asset.pk} ({asset.asset_type}):")
                    self.stdout.write(f"    {asset.url}")
                    self.stdout.write(f"    {new_url}")
                rewritten += 1
                continue
            pending.append(MediaAsset(pk=asset.pk, url=new_url))
            if len(pending) >= _BULK_CHUNK:
                MediaAsset.objects.bulk_update(pending, ["url"])
                rewritten += len(pending)
                pending = []
        if not dry_run and pending:
            MediaAsset.objects.bulk_update(pending, ["url"])
            rewritten += len(pending)

        if dry_run:
            mirrored = (
                MediaAsset.objects.filter(local_name__isnull=False)
                .filter(
                    Q(url__startswith="https://image.tmdb.org/t/p/")
                    | Q(url__startswith="https://images.igdb.com/igdb/image/upload/")
                )
                .count()
            )
            self.stdout.write(
                f"[dry-run] would rewrite {rewritten} URLs; "
                f"{mirrored} provider-mirrored rows to re-download"
            )
            return

        # Rows that carry a local mirror at a now-max-res URL still hold the
        # previously downloaded (low-res) file, so refetch them at full res.
        candidates = MediaAsset.objects.filter(local_name__isnull=False).filter(
            Q(url__startswith="https://image.tmdb.org/t/p/original/")
            | Q(url__startswith="https://images.igdb.com/igdb/image/upload/t_original/")
        )
        if limit is not None:
            candidates = candidates[:limit]
        to_download = list(candidates.values_list("pk", flat=True))

        self.stdout.write(f"rewrote {rewritten} URLs; re-downloading {len(to_download)} mirrors")

        redownloaded = 0
        redownload_failed = 0
        bytes_freed = 0
        bytes_written = 0
        with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            futures = [executor.submit(_redownload_one, pk) for pk in to_download]
            for future in as_completed(futures):
                _pk, written, freed = future.result()
                if written:
                    redownloaded += 1
                    bytes_written += written
                    bytes_freed += freed
                else:
                    redownload_failed += 1

        self.stdout.write(
            f"updated={rewritten} redownloaded={redownloaded} "
            f"redownload_failed={redownload_failed} bytes_freed={bytes_freed} "
            f"bytes_written={bytes_written}"
        )
