"""Round-trip smoke test for the Lists model layer."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.lists.models import (
    Collection,
    CollectionItem,
    ListItemRankHistory,
    MediaListCollaborator,
    MediaListLike,
    UserList,
    UserListItem,
)
from apps.media.models import MediaItem, Movie


class ListsRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            username="lists_tester", password="secret"
        )

    def test_collection_and_movie_fk_round_trip(self) -> None:
        collection = Collection.objects.create(
            name="Marvel Cinematic Universe", overview="Shared universe.", content_hash="abc"
        )
        item = MediaItem.objects.create(media_type="movie", title="Iron Man", slug="iron-man")
        movie = Movie.objects.create(media_item=item, collection=collection, runtime=126)

        self.assertEqual(movie.collection, collection)
        self.assertEqual(collection.movies.get(), movie)
        self.assertEqual(collection.items.count(), 0)

        join = CollectionItem.objects.create(collection=collection, media_item=item, sort_order=0)
        self.assertIn(join, collection.items.all())
        self.assertIn(join, item.collection_items.all())
        # TMDB collection ids attach through the external_ids GenericRelation.
        self.assertEqual(collection.external_ids.count(), 0)

    def test_user_list_item_round_trip(self) -> None:
        user_list = UserList.objects.create(
            user=self.user, name="Favorites", is_public=True, description="My picks."
        )
        media = MediaItem.objects.create(media_type="movie", title="Test Film", slug="test-film")
        entry = UserListItem.objects.create(list=user_list, media_item=media, sort_order=1)

        self.assertEqual(user_list.user, self.user)
        self.assertIn(user_list, self.user.user_lists.all())
        self.assertEqual(user_list.items.get(), entry)
        self.assertEqual(media.user_list_items.get(), entry)

        collaborator = MediaListCollaborator.objects.create(
            list=user_list, user=self.user, permission="EDIT", status="accepted"
        )
        like = MediaListLike.objects.create(list=user_list, user=self.user)
        rank = ListItemRankHistory.objects.create(
            list=user_list,
            media_item=media,
            user=self.user,
            old_sort_order=1,
            new_sort_order=0,
        )

        self.assertIn(collaborator, user_list.collaborators.all())
        self.assertIn(like, user_list.likes.all())
        self.assertIn(rank, user_list.rank_history.all())
        self.assertIn(collaborator, self.user.list_collaborations.all())
        self.assertIn(like, self.user.list_likes.all())
        self.assertIn(rank, self.user.list_rank_changes.all())
