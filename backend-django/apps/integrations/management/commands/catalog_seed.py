"""Management command: bulk-seed catalog rows from the TMDB popular list.

Wraps the catalog-seed driver (``apps.integrations.services.catalog_seed``):
``enqueue_tmdb_popular`` pages the TMDB popular list and enqueues a pending
``SyncJob`` per id that is not already mapped; ``--drain`` then runs the oldest
pending tmdb jobs through the sync engines (``execute_sync_job``), so a single
invocation both tops up the queue and consumes it. IGDB/SteamGrid/MusicBrainz
discovery sources stay deferred. Resolved through the module attribute at call
time so tests can patch either function.
"""

import asyncio

from django.core.management.base import BaseCommand, CommandError

from apps.integrations.services import catalog_seed

_KINDS = ("movie", "show")


class Command(BaseCommand):
    help = "Bulk-seed catalog rows from the TMDB popular list for a media kind."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--kind",
            choices=_KINDS,
            default="movie",
            help="TMDB media kind to seed (movie|show).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=25,
            help="Max distinct popular ids to enqueue (default 25).",
        )
        parser.add_argument(
            "--drain",
            action="store_true",
            help="After enqueueing, run the oldest pending tmdb sync jobs.",
        )

    def handle(self, *args, **options) -> None:
        kind = options["kind"]
        limit = options["limit"]
        if limit < 1:
            raise CommandError("--limit must be >= 1")
        summary = asyncio.run(catalog_seed.enqueue_tmdb_popular(kind, limit=limit))
        self.stdout.write(
            self.style.SUCCESS(
                f"discovered {summary['discovered']} popular {kind} ids; "
                f"enqueued {summary['enqueued']} new sync jobs"
            )
        )
        if options["drain"]:
            drain = catalog_seed.run_pending_jobs(provider="tmdb", entity_type=kind)
            self.stdout.write(
                self.style.SUCCESS(
                    f"drained {drain['ran']} jobs: {drain['succeeded']} succeeded, "
                    f"{drain['failed']} failed, {drain['skipped']} skipped"
                )
            )
