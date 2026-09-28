"""Management command to simplify existing genres in the database.

Splits composite genres (&, /, and) into individual genres and normalizes
aliases (e.g. Sci-Fi -> Science Fiction), migrating MediaGenre and MediaGenreType
links accordingly.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.media.services.genre_simplification import backfill_genres


class Command(BaseCommand):
    help = (
        "Simplify and normalize genres (split '&' composites and unify Sci-Fi -> Science Fiction)."
    )

    def handle(self, *args, **options):
        self.stdout.write("Starting genre simplification backfill...")
        stats = backfill_genres()
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully completed genre simplification: "
                f"{stats['genres_processed']} processed, "
                f"{stats['genres_migrated']} migrated, "
                f"{stats['genres_removed']} removed, "
                f"{stats['links_created']} links created."
            )
        )
