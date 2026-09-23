"""Script to hydrate Discover feeds by seeding popular catalog and processing sync jobs."""

from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django.setup()

# ruff: noqa: E402, I001
# Import task definitions to ensure provider sync engines (@register_sync_engine) are registered
import apps.integrations.tasks  # noqa: F401
from django.db import connection
from apps.integrations.models import SyncJob
from apps.integrations.services.catalog_seed import seed_popular_catalog
from apps.integrations.services.sync import execute_sync_job
from apps.media.services import assets as assets_service


def process_job(job_pk: int) -> dict:
    try:
        return execute_sync_job(job_pk)
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description="Hydrate Discover feeds for Otix")
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
    args = parser.parse_args()

    pending_count = (
        SyncJob.objects.filter(status="pending")
        .exclude(entity_type__in=["music", "album"])
        .exclude(provider="musicbrainz")
        .count()
    )

    should_seed = args.seed or (pending_count == 0)
    if should_seed:
        print(f"[*] Seeding popular catalog from TMDB & IGDB (limit={args.limit})...")
        try:
            seed_summary = seed_popular_catalog(limit=args.limit)
            print(f"[*] Seed results: {seed_summary}")
        except Exception as e:
            print(f"[-] Catalog seed error: {e}")

    if args.skip_sync:
        print("[+] Seeding complete. Skipped sync execution.")
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
        print("[*] No pending jobs to execute.")
        return

    print(f"[*] Processing {total} pending sync jobs with {args.workers} threads...")
    start_time = time.time()
    succeeded = 0
    failed = 0
    skipped = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_job, pk): pk for pk in job_pks}
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
                    print(f"[-] Job {pk} failed: {err}")
                else:
                    skipped += 1
            except Exception as exc:
                failed += 1
                print(f"[-] Job {pk} exception: {exc}")

            if completed % 10 == 0 or completed == total:
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                print(
                    f"[{completed}/{total}] Progress: {completed * 100 // total}% | "
                    f"Success: {succeeded}, Fail: {failed}, Skip: {skipped} | "
                    f"{rate:.1f} jobs/s | Elapsed: {elapsed:.0f}s"
                )

    total_elapsed = time.time() - start_time
    print(
        f"\n[+] Sync jobs finished in {total_elapsed:.1f}s. "
        f"(Succeeded: {succeeded}, Failed: {failed}, Skipped: {skipped})"
    )

    if args.mirror_limit > 0:
        print(f"\n[*] Running artwork mirroring sweep (limit={args.mirror_limit})...")
        try:
            mirror_result = assets_service.sweep_unmirrored_media(limit=args.mirror_limit)
            print(f"[*] Artwork sweep: {mirror_result}")
        except Exception as e:
            print(f"[-] Artwork sweep error: {e}")


if __name__ == "__main__":
    main()
