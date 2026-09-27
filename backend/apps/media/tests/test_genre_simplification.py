"""Unit tests for genre simplification and backfill."""

from django.test import TestCase

from apps.media.models import Genre, MediaGenre, MediaGenreType, MediaItem
from apps.media.services.genre_simplification import (
    backfill_genres,
    simplify_genre_names,
    split_and_simplify_genre,
)


class GenreSimplificationTests(TestCase):
    def test_split_and_simplify_genre_ampersand(self):
        self.assertEqual(
            split_and_simplify_genre("Action & Adventure"),
            ["Action", "Adventure"],
        )
        self.assertEqual(
            split_and_simplify_genre("War & Politics"),
            ["War", "Politics"],
        )
        self.assertEqual(
            split_and_simplify_genre("Action / Adventure"),
            ["Action", "Adventure"],
        )
        # Verify phrases with word 'and' like 'Hack and slash' are preserved
        self.assertEqual(
            split_and_simplify_genre("Hack and slash"),
            ["Hack and slash"],
        )

    def test_sci_fi_unifies_to_science_fiction(self):
        self.assertEqual(split_and_simplify_genre("Sci-Fi"), ["Science Fiction"])
        self.assertEqual(split_and_simplify_genre("sci fi"), ["Science Fiction"])
        self.assertEqual(split_and_simplify_genre("Science-Fiction"), ["Science Fiction"])
        self.assertEqual(split_and_simplify_genre("Science Fiction"), ["Science Fiction"])

    def test_compound_sci_fi_and_fantasy(self):
        self.assertEqual(
            split_and_simplify_genre("Sci-Fi & Fantasy"),
            ["Science Fiction", "Fantasy"],
        )

    def test_preserve_acronyms(self):
        self.assertEqual(split_and_simplify_genre("R&B"), ["R&B"])

    def test_simplify_genre_names_deduplication(self):
        raw = ["Animation", "Sci-Fi & Fantasy", "Action & Adventure", "Drama", "Sci-Fi"]
        simplified = simplify_genre_names(raw)
        self.assertEqual(
            simplified,
            ["Animation", "Science Fiction", "Fantasy", "Action", "Adventure", "Drama"],
        )

    def test_backfill_genres(self):
        # Create media items
        show_item = MediaItem.objects.create(media_type="show", title="Show A", slug="show-a")
        game_item = MediaItem.objects.create(media_type="game", title="Game B", slug="game-b")

        # Create legacy genres
        legacy_scifi = Genre.objects.create(name="Sci-Fi", slug="sci-fi")
        legacy_action_adv = Genre.objects.create(name="Action & Adventure", slug="action-adventure")

        # Attach media types
        MediaGenreType.objects.create(genre=legacy_scifi, media_type="game")
        MediaGenreType.objects.create(genre=legacy_action_adv, media_type="show")

        # Link media items
        MediaGenre.objects.create(media_item=game_item, genre=legacy_scifi)
        MediaGenre.objects.create(media_item=show_item, genre=legacy_action_adv)

        # Run backfill
        stats = backfill_genres()
        self.assertGreater(stats["genres_migrated"], 0)

        # Legacy genres should no longer exist
        self.assertFalse(Genre.objects.filter(slug="sci-fi").exists())
        self.assertFalse(Genre.objects.filter(slug="action-adventure").exists())

        # Canonical target genres must exist
        scifi_genre = Genre.objects.get(slug="science-fiction")
        self.assertEqual(scifi_genre.name, "Science Fiction")
        action_genre = Genre.objects.get(slug="action")
        adv_genre = Genre.objects.get(slug="adventure")

        # Links must be migrated
        self.assertTrue(MediaGenre.objects.filter(media_item=game_item, genre=scifi_genre).exists())
        self.assertTrue(MediaGenre.objects.filter(media_item=show_item, genre=action_genre).exists())
        self.assertTrue(MediaGenre.objects.filter(media_item=show_item, genre=adv_genre).exists())

        # MediaGenreTypes must be preserved
        self.assertTrue(MediaGenreType.objects.filter(genre=scifi_genre, media_type="game").exists())
        self.assertTrue(MediaGenreType.objects.filter(genre=action_genre, media_type="show").exists())
        self.assertTrue(MediaGenreType.objects.filter(genre=adv_genre, media_type="show").exists())
