"""Model round-trip smoke tests for the people app.

Exercises the cross-app hub: a Person + Show + Season + Episode + MediaCredit,
asserting the FK reverse accessors behave both from the people side and from
the media side.
"""

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.media.models import Episode, ExternalID, MediaItem, Season, Show
from apps.people.models import MediaCredit, Person, PersonAsset, PersonRating, UserPersonFollow

User = get_user_model()


class PeopleRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="follower", password="x")

    def _show_and_season(self) -> tuple[Show, Season]:
        media_item = MediaItem.objects.create(
            media_type="show", title="Chernobyl", slug="chernobyl"
        )
        show = Show.objects.create(media_item=media_item)
        season = Season.objects.create(show=show, season_number=1)
        return show, season

    def test_credit_links_person_and_media_item(self) -> None:
        show, season = self._show_and_season()
        Episode.objects.create(season=season, episode_number=1, name="1:23:45")
        person = Person.objects.create(name="Jared Harris")

        credit = MediaCredit.objects.create(
            media_item=show.media_item,
            person=person,
            role="Actor",
            character_name="Valery Legasov",
        )

        # Person -> credits -> media item.
        self.assertEqual(list(person.credits.all()), [credit])
        self.assertEqual(credit.person, person)
        self.assertEqual(credit.media_item, show.media_item)
        # MediaItem -> credits (reverse FK created automatically cross-app).
        self.assertEqual(list(show.media_item.credits.all()), [credit])
        self.assertEqual(show.media_item.credits.first().person, person)

    def test_person_asset_and_external_id(self) -> None:
        person = Person.objects.create(name="Alicia Vikander")
        asset = PersonAsset.objects.create(
            person=person, url="https://img.example.com/alicja.jpg", width=1200
        )
        self.assertEqual(list(person.assets.all()), [asset])

        external = ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(Person),
            object_id=person.pk,
            provider="tmdb",
            external_id="64671",
        )
        self.assertEqual(external.target, person)
        self.assertEqual(list(person.external_ids.all()), [external])

    def test_follow_and_rating(self) -> None:
        person = Person.objects.create(name="Denis Villeneuve")
        follow = UserPersonFollow.objects.create(user=self.user, person=person)
        rating = PersonRating.objects.create(user=self.user, person=person, score=9)

        self.assertEqual(list(person.followers.all()), [follow])
        self.assertEqual(list(person.ratings.all()), [rating])
        self.assertEqual(list(self.user.person_follows.all()), [follow])
        self.assertEqual(list(self.user.person_ratings.all()), [rating])
