"""Management command: bulk-seed catalog rows from a TMDB discovery source.

Wraps the catalog-seed driver (``apps.integrations.services.catalog_seed``).
``--source popular`` (default) pages the TMDB popular list;
``--source daily`` downloads TMDB's daily movie/show ID export from
files.tmdb.org — ``--limit 0`` walks the whole file (the operator-facing full
catalog rebuild), otherwise it caps the walk. Either way every id the catalog
does not already map becomes a pending ``SyncJob``; ``--drain`` then runs the
oldest pending tmdb jobs through the sync engines (``execute_sync_job``), so a
single invocation both tops up the queue and consumes it.
IGDB/SteamGrid/MusicBrainz discovery sources stay deferred. Resolved through the
module attribute at call time so tests can patch either function.
"""

import asyncio

from django.core.management.base import BaseCommand, CommandError

from apps.integrations.services import catalog_seed

_KINDS = ("movie", "show")
_SOURCES = ("popular", "daily")


class Command(BaseCommand):
    help = "Bulk-seed catalog rows from a TMDB discovery source for a media kind."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--kind",
            choices=_KINDS,
            default="movie",
            help="TMDB media kind to seed (movie|show).",
        )
        parser.add_argument(
            "--source",
            choices=_SOURCES,
            default="popular",
            help="Discovery source (popular list | daily ID export).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=25,
            help="Max distinct ids to enqueue (default 25; daily: 0 = whole file).",
        )
        parser.add_argument(
            "--drain",
            action="store_true",
            help="After enqueueing, run the oldest pending tmdb sync jobs.",
        )

    def handle(self, *args, **options) -> None:
        kind = options["kind"]
        source = options["source"]
        limit = options["limit"]
        if limit < (0 if source == "daily" else 1):
            minimum = ">= 1" if source == "popular" else ">= 0 (0 = whole export)"
            raise CommandError(f"--limit must be {minimum}")
        if source == "daily":
            summary = asyncio.run(
                catalog_seed.enqueue_tmdb_daily(kind, limit=None if limit == 0 else limit)
            )
        else:
            summary = asyncio.run(catalog_seed.enqueue_tmdb_popular(kind, limit=limit))
        self.stdout.write(
            self.style.SUCCESS(
                f"discovered {summary['discovered']} {source} {kind} ids; "
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
