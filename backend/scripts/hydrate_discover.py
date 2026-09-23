"""Script to hydrate Discover feeds by processing pending sync jobs and mirroring artwork."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django.setup()

# Import task definitions to ensure provider sync engines (@register_sync_engine) are registered
import apps.integrations.tasks  # noqa: F401
from apps.integrations.models import SyncJob
from apps.integrations.services.sync import execute_sync_job
from apps.media.services import assets as assets_service
from django.db import connection


def process_job(job_pk: int) -> dict:
    try:
        return execute_sync_job(job_pk)
    finally:
        connection.close()


def main():
    pending_qs = (
        SyncJob.objects.filter(status="pending")
        .exclude(entity_type__in=["music", "album"])
        .exclude(provider="musicbrainz")
        .order_by("priority", "created_at", "pk")
    )
    total = pending_qs.count()
    print(f"[*] Found {total} pending sync jobs to process.")

    job_pks = list(pending_qs.values_list("pk", flat=True))
    if not job_pks:
        print("[*] No pending jobs. Checking discover state...")
        return

    workers = 5
    print(f"[*] Starting thread pool with {workers} workers...")
    start_time = time.time()
    succeeded = 0
    failed = 0
    skipped = 0

    with ThreadPoolExecutor(max_workers=workers) as executor:
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
                    print(f"[-] Job {pk} failed: {outcome.get('error') or outcome.get('detail')}")
                else:
                    skipped += 1
            except Exception as exc:
                failed += 1
                print(f"[-] Job {pk} exception: {exc}")

            if completed % 10 == 0 or completed == total:
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                print(
                    f"[{completed}/{total}] Progress: {completed*100//total}% | "
                    f"Success: {succeeded}, Fail: {failed}, Skip: {skipped} | "
                    f"{rate:.1f} jobs/s | Elapsed: {elapsed:.0f}s"
                )

    print(f"\n[*] Sync jobs finished in {time.time() - start_time:.1f}s.")
    print(f"[*] Succeeded: {succeeded}, Failed: {failed}, Skipped: {skipped}")

    print("\n[*] Mirroring discover artwork for hero and shelves...")
    try:
        mirror_result = assets_service.sweep_unmirrored_media(limit=60)
        print(f"[*] Artwork mirror result: {mirror_result}")
    except Exception as e:
        print(f"[-] Artwork sweep error: {e}")


if __name__ == "__main__":
    main()
