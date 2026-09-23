"""Command to hydrate Discover feeds by seeding popular catalog and processing sync jobs.

Usage:
    python manage.py hydrate_discover [--limit 50] [--seed] [--workers 8]
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.core.management.base import BaseCommand
from django.db import connection

import apps.integrations.tasks  # noqa: F401 - registers sync engines
from apps.integrations.models import SyncJob
from apps.integrations.services.catalog_seed import seed_popular_catalog
from apps.integrations.services.sync import execute_sync_job
from apps.media.services import assets as assets_service

logger = logging.getLogger(__name__)


def _process_job(job_pk: int) -> dict:
    try:
        return execute_sync_job(job_pk)
    finally:
        connection.close()


class Command(BaseCommand):
    help = "Seed and hydrate Discover catalog for movies, shows, and games"

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Number of popular items to discover per category (default: 50)",
        )
        parser.add_argument(
            "--seed",
            action="store_true",
            default=False,
            help="Force enqueuing discovery seeds from TMDB and IGDB even if jobs exist",
        )
        parser.add_argument(
            "--workers",
            type=int,
            default=8,
            help="Number of concurrent worker threads for sync jobs (default: 8)",
        )
        parser.add_argument(
            "--skip-sync",
            action="store_true",
            default=False,
            help="Only enqueue discovery seeds without draining sync jobs",
        )
        parser.add_argument(
            "--mirror-limit",
            type=int,
            default=50,
            help="Limit for server-side artwork mirroring sweep (default: 50)",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        force_seed = options["seed"]
        workers = options["workers"]
        skip_sync = options["skip_sync"]
        mirror_limit = options["mirror_limit"]

        pending_count = (
            SyncJob.objects.filter(status="pending")
            .exclude(entity_type__in=["music", "album"])
            .exclude(provider="musicbrainz")
            .count()
        )

        should_seed = force_seed or (pending_count == 0)
        if should_seed:
            self.stdout.write(
                self.style.NOTICE(
                    f"[*] Seeding popular catalog from TMDB & IGDB (limit={limit})..."
                )
            )
            try:
                seed_summary = seed_popular_catalog(limit=limit)
                self.stdout.write(self.style.SUCCESS(f"[*] Seed results: {seed_summary}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"[-] Catalog seed error: {e}"))

        if skip_sync:
            self.stdout.write(self.style.SUCCESS("[+] Seeding complete. Skipped sync execution."))
            return

        pending_qs = (
            SyncJob.objects.filter(status="pending")
            .exclude(entity_type__in=["music", "album"])
            .exclude(provider="musicbrainz")
            .order_by("priority", "created_at", "pk")
        )
        job_pks = list(pending_qs.values_list("pk", flat=True))
        total = len(job_pks)

        if not total:
            self.stdout.write(self.style.WARNING("[*] No pending jobs to execute."))
            return

        self.stdout.write(
            self.style.NOTICE(f"[*] Processing {total} pending sync jobs with {workers} threads...")
        )
        start_time = time.time()
        succeeded = 0
        failed = 0
        skipped = 0

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(_process_job, pk): pk for pk in job_pks}
            completed = 0
            for future in as_completed(futures):
                completed += 1
                pk = futures[future]
                try:
                    outcome = future.result()
                    status = outcome.get("status")
                    if status == "success":
                        succeeded += 1
                    elif status == "failed":
                        failed += 1
                        err = outcome.get("error") or outcome.get("detail")
                        self.stdout.write(self.style.WARNING(f"[-] Job {pk} failed: {err}"))
                    else:
                        skipped += 1
                except Exception as exc:
                    failed += 1
                    self.stdout.write(self.style.ERROR(f"[-] Job {pk} exception: {exc}"))

                if completed % 10 == 0 or completed == total:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed if elapsed > 0 else 0
                    self.stdout.write(
                        f"[{completed}/{total}] Progress: {completed * 100 // total}% | "
                        f"Success: {succeeded}, Fail: {failed}, Skip: {skipped} | "
                        f"{rate:.1f} jobs/s | Elapsed: {elapsed:.0f}s"
                    )

        total_elapsed = time.time() - start_time
        self.stdout.write(
            self.style.SUCCESS(
                f"[+] Sync jobs finished in {total_elapsed:.1f}s. "
                f"(Succeeded: {succeeded}, Failed: {failed}, Skipped: {skipped})"
            )
        )

        if mirror_limit > 0:
            self.stdout.write(
                self.style.NOTICE(f"[*] Running artwork mirroring sweep (limit={mirror_limit})...")
            )
            try:
                mirror_result = assets_service.sweep_unmirrored_media(limit=mirror_limit)
                self.stdout.write(self.style.SUCCESS(f"[*] Artwork sweep: {mirror_result}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"[-] Artwork sweep error: {e}"))
