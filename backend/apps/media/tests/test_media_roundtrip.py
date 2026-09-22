"""Model round-trip smoke tests for the media catalog hub.

Proves create + read + reverse accessors against the real (sqlite) test
database. Full "endpoint resolves" tests arrive with the endpoint-port wave.
"""

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.media.models import (
    Episode,
    ExternalID,
    Franchise,
    Game,
    Genre,
    MediaGenre,
    MediaItem,
    Movie,
    Season,
    Show,
)

User = get_user_model()


def _media_item(media_type: str, title: str, slug: str) -> MediaItem:
    return MediaItem.objects.create(media_type=media_type, title=title, slug=slug)


class MediaSubtypeRoundTripTests(TestCase):
    def test_show_season_episode_reverse_accessors(self) -> None:
        media_item = _media_item("show", "Severance", "severance")
        show = Show.objects.create(
            media_item=media_item,
            status="returning",
            first_air_date="2022-02-18",
            last_air_date="2025-03-21",
            number_of_seasons=2,
            number_of_episodes=20,
        )
        season = Season.objects.create(show=show, season_number=1, name="Season 1")
        episode = Episode.objects.create(
            season=season, episode_number=1, name="Good News About Hell", runtime=49
        )

        # OneToOne-PK subtype: child PK equals the media item id.
        self.assertEqual(show.pk, media_item.pk)
        self.assertEqual(show.media_item, media_item)
        self.assertEqual(media_item.show, show)
        # Native reverse chains: media_item -> show -> seasons -> episodes.
        self.assertEqual(list(media_item.show.seasons.all()), [season])
        self.assertEqual(list(show.seasons.all()), [season])
        self.assertEqual(season.show, show)
        self.assertEqual(list(season.episodes.all()), [episode])
        self.assertEqual(episode.season, season)

    def test_movie_subtype_pk_equals_media_item_id(self) -> None:
        media_item = _media_item("movie", "The Godfather", "the-godfather")
        movie = Movie.objects.create(media_item=media_item, runtime=175, is_anime=False)
        self.assertEqual(movie.pk, media_item.pk)
        self.assertEqual(movie.media_item, media_item)
        self.assertEqual(media_item.movie, movie)

    def test_game_and_franchise(self) -> None:
        franchise = Franchise.objects.create(name="Final Fantasy", slug="final-fantasy")
        game_item = _media_item("game", "Final Fantasy VII", "ff7")
        game = Game.objects.create(media_item=game_item, franchise=franchise, game_type="main_game")
        self.assertEqual(game.pk, game_item.pk)
        self.assertEqual(list(franchise.games.all()), [game])


class MediaJoinAndExternalIdTests(TestCase):
    def test_genre_join_reverse_accessor(self) -> None:
        media_item = _media_item("show", "The Wire", "the-wire")
        genre = Genre.objects.create(name="Crime", slug="crime")
        MediaGenre.objects.create(media_item=media_item, genre=genre)

        self.assertEqual(media_item.media_genres.count(), 1)
        self.assertEqual(media_item.media_genres.first().genre, genre)

    def test_external_id_generic_foreign_key_roundtrip(self) -> None:
        media_item = _media_item("show", "Breaking Bad", "breaking-bad")
        external = ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media_item.pk,
            provider="tmdb",
            external_id="1396",
            media_type="show",
        )

        self.assertEqual(external.target, media_item)
        self.assertEqual(media_item.external_ids.count(), 1)
        self.assertEqual(media_item.external_ids.first().external_id, "1396")
