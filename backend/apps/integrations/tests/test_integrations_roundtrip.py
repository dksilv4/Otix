"""Model round-trip smoke tests for the integrations app."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.integrations.models import (
    ProviderState,
    SyncJob,
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
    UserSteamWishlist,
    UserYoutubeLikedVideo,
)
from apps.media.models import Game, MediaItem

User = get_user_model()


class IntegrationsRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="player", password="x")

    def test_plex_server_library_item_roundtrip(self) -> None:
        media_item = MediaItem.objects.create(
            media_type="movie", title="Heat", slug="heat"
        )
        server = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="deadbeef",
            name="Living Room",
            owned=True,
        )
        library = UserPlexLibrary.objects.create(
            user=self.user,
            server=server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )
        item = UserPlexItem.objects.create(
            user=self.user,
            server=server,
            library=library,
            media_item=media_item,
            rating_key="12345",
            media_type="movie",
            title="Heat",
            guids=[{"id": "imdb://tt0113277", "provider": "imdb"}],
        )

        self.assertEqual(list(self.user.plex_servers.all()), [server])
        self.assertEqual(list(self.user.plex_libraries.all()), [library])
        self.assertEqual(list(self.user.plex_items.all()), [item])
        self.assertEqual(list(server.libraries.all()), [library])
        self.assertEqual(list(server.items.all()), [item])
        self.assertEqual(list(library.items.all()), [item])
        self.assertEqual(list(media_item.plex_items.all()), [item])
        self.assertEqual(item.guids, [{"id": "imdb://tt0113277", "provider": "imdb"}])

    def test_steam_game_and_wishlist_roundtrip(self) -> None:
        media_item = MediaItem.objects.create(
            media_type="game", title="Disco Elysium", slug="disco-elysium"
        )
        Game.objects.create(media_item=media_item)
        game = UserSteamGame.objects.create(
            user=self.user,
            media_item=media_item,
            steam_app_id=632470,
            name="Disco Elysium",
            playtime_forever=120,
        )
        wishlist = UserSteamWishlist.objects.create(
            user=self.user,
            steam_app_id=999999,
            name="Hollow Knight: Silksong",
            is_free=False,
        )

        self.assertEqual(list(self.user.steam_games.all()), [game])
        self.assertEqual(list(self.user.steam_wishlist.all()), [wishlist])
        self.assertEqual(list(media_item.steam_games.all()), [game])
        self.assertEqual(game.media_item, media_item)

    def test_youtube_syncjob_providerstate_roundtrip(self) -> None:
        liked = UserYoutubeLikedVideo.objects.create(
            user=self.user,
            video_id="dQw4w9WgXcQ",
            title="Never Gonna Give You Up",
        )
        child_job = SyncJob.objects.create(
            provider="youtube",
            entity_type="media_item",
            external_id="dQw4w9WgXcQ",
        )
        parent_job = SyncJob.objects.create(
            provider="youtube",
            entity_type="user",
            external_id=str(self.user.pk),
        )
        child_job.parent = parent_job
        child_job.save(update_fields=["parent"])
        state = ProviderState.objects.create(provider="youtube", cursor_value="abc")

        self.assertEqual(list(self.user.youtube_liked_videos.all()), [liked])
        self.assertEqual(list(parent_job.children.all()), [child_job])
        self.assertEqual(ProviderState.objects.get(provider="youtube"), state)
