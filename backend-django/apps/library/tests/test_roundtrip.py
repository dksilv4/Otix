"""Model round-trip smoke tests for library, track and search apps.

Proves create + read + reverse accessors for UserLocalGame (library),
GameSave* path models (track) and SearchLog (search) against a real
(sqlite) test database, linked back to the media catalog hub.
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from apps.library.models import UserLocalGame
from apps.media.models import MediaItem, Movie
from apps.search.models import SearchLog
from apps.track.models import GameSaveOfficialPath, GameSavePathSuggestion

User = get_user_model()


class LibraryTrackSearchRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="roundtrip", password="x")
        self.item = MediaItem.objects.create(
            media_type="movie", title="Her", slug="her-2013"
        )
        self.movie = Movie.objects.create(media_item=self.item, runtime=126)

    def test_user_local_game_linked_to_movie(self) -> None:
        game = UserLocalGame.objects.create(
            user=self.user,
            title="Her",
            platform="windows",
            media_item=self.item,
            match_suggestion_media=self.item,
        )

        self.assertEqual(game.user, self.user)
        self.assertEqual(game.media_item, self.item)
        self.assertEqual(list(self.user.local_games.all()), [game])
        # Linked catalog item reaches its local-game matches both ways.
        self.assertEqual(list(self.item.user_local_games.all()), [game])
        self.assertEqual(list(self.item.local_game_match_suggestions.all()), [game])
        # Timestamped columns populated.
        self.assertIsNotNone(game.created_at)
        self.assertIsNotNone(game.last_seen_at)

    def test_user_local_game_unique_per_user_title_platform(self) -> None:
        UserLocalGame.objects.create(
            user=self.user, title="Her", platform="windows"
        )
        with self.assertRaises(IntegrityError):
            UserLocalGame.objects.create(
                user=self.user, title="Her", platform="windows"
            )

    def test_save_path_suggestion_reverses(self) -> None:
        suggestion = GameSavePathSuggestion.objects.create(
            user=self.user,
            game=self.item,
            platform="windows",
            path_pattern=r"%USERPROFILE%\\Saved Games\\Her",
        )

        self.assertEqual(suggestion.user, self.user)
        self.assertEqual(suggestion.game, self.item)
        self.assertEqual(list(self.user.game_save_path_suggestions.all()), [suggestion])
        self.assertEqual(list(self.item.save_path_suggestions.all()), [suggestion])

        # Same user may not suggest the same path twice for a game/platform.
        with self.assertRaises(IntegrityError):
            GameSavePathSuggestion.objects.create(
                user=self.user,
                game=self.item,
                platform="windows",
                path_pattern=r"%USERPROFILE%\\Saved Games\\Her",
            )

    def test_save_official_path_reverse(self) -> None:
        official = GameSaveOfficialPath.objects.create(
            game=self.item,
            platform="windows",
            path_pattern=r"%USERPROFILE%\\Saved Games\\Her",
            is_verified=True,
        )

        self.assertEqual(official.game, self.item)
        self.assertEqual(list(self.item.save_official_paths.all()), [official])

        # One official path per game/platform.
        with self.assertRaises(IntegrityError):
            GameSaveOfficialPath.objects.create(
                game=self.item,
                platform="windows",
                path_pattern=r"%USERPROFILE%\\Saved Games\\Her",
            )

    def test_search_log_reverse(self) -> None:
        log = SearchLog.objects.create(
            user=self.user,
            query="her",
            media_type="movie",
            page=1,
            page_size=20,
            items_returned=1,
        )

        self.assertEqual(log.user, self.user)
        self.assertEqual(list(self.user.search_logs.all()), [log])
        # Anonymous search leaves the FK null.
        anon = SearchLog.objects.create(
            user=None, query="severance", page=1, page_size=20, items_returned=0
        )
        self.assertIsNone(anon.user)
