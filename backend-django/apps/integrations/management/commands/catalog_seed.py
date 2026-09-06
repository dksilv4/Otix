"""Management command: bulk-seed catalog rows from a TMDB/IGDB discovery source.

Wraps the catalog-seed driver (``apps.integrations.services.catalog_seed``).
``--source popular`` pages the provider's popular list (TMDB movie/show pages, or
IGDB's most-rated games); ``--source daily`` (TMDB only) downloads TMDB's daily
movie/show ID export from files.tmdb.org — ``--limit 0`` walks the whole file
(the operator-facing full catalog rebuild), otherwise it caps the walk. Either
way every id the catalog does not already map becomes a pending ``SyncJob``;
``--drain`` then runs the oldest pending jobs of that provider/kind through the
sync engines (``execute_sync_job``), so a single invocation both tops up the
queue and consumes it. SteamGrid artwork and a MusicBrainz bulk discovery source
stay deferred. Resolved through the module attribute at call time so tests can
patch each function.
"""

import asyncio

from django.core.management.base import BaseCommand, CommandError

from apps.integrations.services import catalog_seed

_KINDS = ("movie", "show", "game")
_PROVIDERS = ("tmdb", "igdb")
_SOURCES = ("popular", "daily")


class Command(BaseCommand):
    help = "Bulk-seed catalog rows from a TMDB/IGDB discovery source for a media kind."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--provider",
            choices=_PROVIDERS,
            default="tmdb",
            help="Discovery provider (tmdb|igdb; igdb seeds games off popular).",
        )
        parser.add_argument(
            "--kind",
            choices=_KINDS,
            default="movie",
            help="Media kind to seed (tmdb: movie|show; igdb: game).",
        )
        parser.add_argument(
            "--source",
            choices=_SOURCES,
            default="popular",
            help="Discovery source (popular list | TMDB daily ID export).",
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
            help="After enqueueing, run the oldest pending sync jobs.",
        )

    def handle(self, *args, **options) -> None:
        provider = options["provider"]
        kind = options["kind"]
        source = options["source"]
        limit = options["limit"]
        if source == "daily":
            if provider != "tmdb":
                raise CommandError("--source daily is TMDB-only (IGDB has no ID export)")
            if kind == "game":
                raise CommandError("TMDB --source daily seeds --kind movie|show only")
            minimum = ">= 0 (0 = whole export)"
        elif provider == "igdb":
            if kind != "game":
                raise CommandError("IGDB discovery seeds --kind game only")
            minimum = ">= 1"
        else:
            if kind == "game":
                raise CommandError("TMDB discovery seeds --kind movie|show only")
            minimum = ">= 1"
        if limit < (0 if source == "daily" else 1):
            raise CommandError(f"--limit must be {minimum}")

        if source == "daily":
            summary = asyncio.run(
                catalog_seed.enqueue_tmdb_daily(kind, limit=None if limit == 0 else limit)
            )
            drain_provider, drain_kind = "tmdb", kind
        elif provider == "igdb":
            summary = asyncio.run(catalog_seed.enqueue_igdb_popular(limit=limit))
            drain_provider, drain_kind = "igdb", "game"
        else:
            summary = asyncio.run(catalog_seed.enqueue_tmdb_popular(kind, limit=limit))
            drain_provider, drain_kind = "tmdb", kind
        self.stdout.write(
            self.style.SUCCESS(
                f"discovered {summary['discovered']} {source} {kind} ids; "
                f"enqueued {summary['enqueued']} new sync jobs"
            )
        )
        if options["drain"]:
            drain = catalog_seed.run_pending_jobs(
                provider=drain_provider, entity_type=drain_kind
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"drained {drain['ran']} jobs: {drain['succeeded']} succeeded, "
                    f"{drain['failed']} failed, {drain['skipped']} skipped"
                )
            )
