"""ExternalID identity, attach/crosswalk, and merge of existing stub twins."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError
from django.test import TestCase

from apps.integrations.models import SyncJob, UserSteamGame
from apps.lists.models import UserList, UserListItem
from apps.media.models import ExternalID, MediaItem, Movie
from apps.media.services.identity import (
    CANONICAL_PROVIDER,
    attach_external_id,
    find_media_id,
    merge_media_items,
)
from apps.social.models import UserMediaInteraction

User = get_user_model()


def _ext(
    media_id: int, provider: str, external_id: str, media_type: str | None = "movie"
) -> ExternalID:
    return ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media_id,
        provider=provider,
        external_id=external_id,
        media_type=media_type,
    )


def _movie(title: str, slug: str) -> MediaItem:
    media = MediaItem.objects.create(media_type="movie", title=title, slug=slug)
    Movie.objects.create(media_item=media)
    return media


class FindMediaIdTests(TestCase):
    def test_finds_by_provider_id_and_media_type(self):
        media = _movie("Fight Club", "fight-club")
        _ext(media.pk, "tmdb", "550")
        self.assertEqual(find_media_id("tmdb", "550", "movie"), media.pk)

    def test_missing_id_returns_none(self):
        self.assertIsNone(find_media_id("tmdb", "550", "movie"))

    def test_movie_id_does_not_match_show(self):
        media = _movie("Fight Club", "fight-club")
        _ext(media.pk, "tmdb", "550", "movie")
        self.assertIsNone(find_media_id("tmdb", "550", "show"))


class AttachExternalIdTests(TestCase):
    def test_creates_mapping_on_the_hub(self):
        media = _movie("Fight Club", "fight-club")
        attach_external_id(media.pk, "imdb", "tt0137523", "movie")
        self.assertEqual(find_media_id("imdb", "tt0137523", "movie"), media.pk)

    def test_same_id_on_same_hub_is_idempotent(self):
        media = _movie("Fight Club", "fight-club")
        attach_external_id(media.pk, "tmdb", "550", "movie")
        attach_external_id(media.pk, "tmdb", "550", "movie")
        self.assertEqual(ExternalID.objects.filter(provider="tmdb", external_id="550").count(), 1)

    def test_conflicting_id_merges_into_the_canonical_row(self):
        winner = _movie("Fight Club", "fight-club")
        _ext(winner.pk, "tmdb", "550")
        loser = _movie("Fight Club Stub", "fight-club-1999")
        _ext(loser.pk, "plex", "plex://movie/abc", media_type=None)
        result = attach_external_id(loser.pk, "tmdb", "550", "movie")
        self.assertEqual(result, winner.pk)
        self.assertFalse(MediaItem.objects.filter(pk=loser.pk).exists())
        self.assertEqual(find_media_id("plex", "plex://movie/abc", None), winner.pk)
        self.assertEqual(find_media_id("tmdb", "550", "movie"), winner.pk)


class MergeMediaItemsTests(TestCase):
    def test_moves_library_list_and_interaction_fks(self):
        user = User.objects.create_user(username="alice", password="pw")
        winner = _movie("Canonical", "canonical")
        _ext(winner.pk, "tmdb", "550")
        loser = _movie("Stub", "stub")
        UserSteamGame.objects.create(user=user, media_item=loser, steam_app_id=400, name="Portal")
        ulist = UserList.objects.create(user=user, name="Favs")
        UserListItem.objects.create(list=ulist, media_item=loser)
        UserMediaInteraction.objects.create(user=user, media_item=loser, interaction_type="liked")
        merge_media_items(winner.pk, loser.pk)
        self.assertFalse(MediaItem.objects.filter(pk=loser.pk).exists())
        self.assertEqual(UserSteamGame.objects.get(steam_app_id=400).media_item_id, winner.pk)
        self.assertEqual(UserListItem.objects.get(list=ulist).media_item_id, winner.pk)
        self.assertTrue(
            UserMediaInteraction.objects.filter(
                user=user, media_item=winner, interaction_type="liked"
            ).exists()
        )

    def test_keeps_winner_row_when_both_have_the_same_interaction(self):
        user = User.objects.create_user(username="bob", password="pw")
        winner = _movie("Canonical", "canonical")
        loser = _movie("Stub", "stub")
        UserMediaInteraction.objects.create(user=user, media_item=winner, interaction_type="liked")
        UserMediaInteraction.objects.create(user=user, media_item=loser, interaction_type="liked")
        merge_media_items(winner.pk, loser.pk)
        self.assertEqual(
            UserMediaInteraction.objects.filter(user=user, interaction_type="liked").count(),
            1,
        )
        self.assertEqual(
            UserMediaInteraction.objects.get(user=user, interaction_type="liked").media_item_id,
            winner.pk,
        )

    def test_same_id_is_a_noop(self):
        media = _movie("Fight Club", "fight-club")
        self.assertEqual(merge_media_items(media.pk, media.pk), media.pk)


class LiveSyncJobUniquenessTests(TestCase):
    def test_second_pending_job_for_the_same_identity_is_rejected(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="550", status="pending"
        )
        with self.assertRaises(IntegrityError):
            SyncJob.objects.create(
                provider="tmdb", entity_type="movie", external_id="550", status="pending"
            )

    def test_completed_job_does_not_block_a_new_pending_job(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="550", status="completed"
        )
        job = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="550", status="pending"
        )
        self.assertEqual(job.status, "pending")

    def test_canonical_provider_map(self):
        self.assertEqual(CANONICAL_PROVIDER["movie"], "tmdb")
        self.assertEqual(CANONICAL_PROVIDER["show"], "tmdb")
        self.assertEqual(CANONICAL_PROVIDER["game"], "igdb")


class ResolveCanonicalIdTests(TestCase):
    def test_steam_app_id_crosswalk_returns_igdb_without_creating_a_hub(self):
        from apps.media.services.catalog_resolve import resolve_canonical_id

        ref = resolve_canonical_id(
            "game",
            ids={"steam": "400"},
            title="Portal",
            igdb_lookup_steam=lambda ids: {400: 71},
        )
        self.assertEqual(ref.provider, "igdb")
        self.assertEqual(ref.external_id, "71")
        self.assertEqual(MediaItem.objects.count(), 0)

    def test_imdb_crosswalk_beats_title_search(self):
        from apps.media.services.catalog_resolve import resolve_canonical_id

        def boom(*_args, **_kwargs):
            raise AssertionError("title search must not run after a crosswalk hit")

        ref = resolve_canonical_id(
            "movie",
            ids={"imdb": "tt0903747"},
            title="Breaking Bad",
            year=2008,
            tmdb_find=lambda _ext, _src: {"movie_results": [{"id": 1396}]},
            tmdb_search=boom,
        )
        self.assertEqual((ref.provider, ref.external_id), ("tmdb", "1396"))

    def test_high_confidence_title_search_returns_tmdb_id(self):
        from apps.media.services.catalog_resolve import resolve_canonical_id

        ref = resolve_canonical_id(
            "movie",
            title="Breaking Bad",
            year=2008,
            tmdb_search=lambda _title, _year: [("1396", "Breaking Bad", 2008)],
        )
        self.assertEqual(ref.external_id, "1396")
        self.assertEqual(MediaItem.objects.count(), 0)

    def test_ambiguous_title_stays_unresolved(self):
        from apps.media.services.catalog_resolve import resolve_canonical_id

        ref = resolve_canonical_id(
            "movie",
            title="Love",
            year=None,
            tmdb_search=lambda _title, _year: [
                ("1", "Love", 2020),
                ("2", "Love", 2021),
            ],
        )
        self.assertIsNone(ref)

    def test_close_second_place_does_not_auto_accept(self):
        from apps.media.services.catalog_resolve import pick_high_confidence_id

        self.assertIsNone(pick_high_confidence_id([("1", 0.96), ("2", 0.95)]))
        self.assertEqual(pick_high_confidence_id([("1", 0.96), ("2", 0.80)]), "1")
        self.assertEqual(pick_high_confidence_id([("1", 0.90)]), "1")

    def test_existing_canonical_id_on_two_hubs_does_not_title_merge(self):
        from apps.media.services.identity import attach_external_id

        batman_2022 = _movie("The Batman", "the-batman")
        batman_1989 = _movie("Batman", "batman")
        attach_external_id(batman_2022.pk, "tmdb", "414906", "movie")
        attach_external_id(batman_1989.pk, "tmdb", "268", "movie")
        self.assertEqual(MediaItem.objects.count(), 2)
        self.assertNotEqual(
            find_media_id("tmdb", "414906", "movie"),
            find_media_id("tmdb", "268", "movie"),
        )


class PlexLibraryIdentityTests(TestCase):
    def test_two_plex_libraries_sharing_tmdb_id_are_one_hub(self):
        from apps.integrations.services.plex_sync import _match_or_seed

        hub = _movie("Fight Club", "fight-club")
        _ext(hub.pk, "tmdb", "550")
        first_id, first_matched = _match_or_seed(
            {"title": "Fight Club", "year": 1999},
            "movie",
            {"tmdb": "550"},
            "plex://movie/library-a",
        )
        second_id, second_matched = _match_or_seed(
            {"title": "Fight Club", "year": 1999},
            "movie",
            {"tmdb": "550"},
            "plex://movie/library-b",
        )
        self.assertTrue(first_matched)
        self.assertTrue(second_matched)
        self.assertEqual(first_id, hub.pk)
        self.assertEqual(second_id, hub.pk)
        self.assertEqual(MediaItem.objects.count(), 1)
        self.assertEqual(
            find_media_id("plex", "plex://movie/library-a", None),
            hub.pk,
        )
        self.assertEqual(
            find_media_id("plex", "plex://movie/library-b", None),
            hub.pk,
        )

    def test_unresolved_title_stays_unmatched_without_a_hub(self):
        from apps.integrations.services.plex_sync import _match_or_seed

        media_id, matched = _match_or_seed(
            {"title": "Totally Unknown Flick", "year": 1999},
            "movie",
            {},
            "plex://movie/no-guid",
        )
        self.assertIsNone(media_id)
        self.assertFalse(matched)
        self.assertEqual(MediaItem.objects.count(), 0)
