"""Model round-trip smoke tests for the company app."""

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.company.models import (
    Company,
    CompanyRating,
    InvolvedCompany,
    UserCompanyFollow,
)
from apps.media.models import ExternalID, Game, MediaItem

User = get_user_model()


class CompanyRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="fan", password="x")

    def test_involved_company_links_company_and_media_item(self) -> None:
        media_item = MediaItem.objects.create(
            media_type="game", title="Disco Elysium", slug="disco-elysium"
        )
        Game.objects.create(media_item=media_item)
        company = Company.objects.create(name="ZA/UM", slug="zaum", origin_country="EE")

        involvement = InvolvedCompany.objects.create(
            media_item=media_item, company=company, developer=True, publisher=True
        )

        self.assertEqual(involvement.media_item, media_item)
        self.assertEqual(involvement.company, company)
        # Reverse accessors on both sides (company FK created automatically cross-app).
        self.assertEqual(list(company.involved_companies.all()), [involvement])
        self.assertEqual(list(media_item.involved_companies.all()), [involvement])

    def test_follow_rating_and_external_id(self) -> None:
        company = Company.objects.create(name="Nintendo", slug="nintendo")
        follow = UserCompanyFollow.objects.create(user=self.user, company=company)
        rating = CompanyRating.objects.create(user=self.user, company=company, score=8)
        external = ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(Company),
            object_id=company.pk,
            provider="igdb",
            external_id="70",
        )

        self.assertEqual(list(company.followers.all()), [follow])
        self.assertEqual(list(company.ratings.all()), [rating])
        self.assertEqual(list(self.user.company_follows.all()), [follow])
        self.assertEqual(list(self.user.company_ratings.all()), [rating])
        self.assertEqual(list(company.external_ids.all()), [external])
