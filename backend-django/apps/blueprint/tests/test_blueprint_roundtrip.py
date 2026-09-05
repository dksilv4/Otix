"""Model round-trip smoke tests for the blueprint app."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.blueprint.models import Blueprint, BlueprintLike

User = get_user_model()


class BlueprintRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="architect", password="x")

    def test_blueprint_and_like_roundtrip(self) -> None:
        blueprint = Blueprint.objects.create(
            user=self.user,
            title="Factorio Mall",
            description="Early-game bus mall",
            blueprint_string="0eNqrB...",
            parsed_data={"tiles": 128},
            tags=["factorio", "mall"],
            downloads=3,
        )
        like = BlueprintLike.objects.create(user=self.user, blueprint=blueprint)

        self.assertEqual(blueprint.user, self.user)
        self.assertEqual(like.blueprint, blueprint)
        # Reverse accessors from both ends.
        self.assertEqual(list(self.user.blueprints.all()), [blueprint])
        self.assertEqual(list(self.user.blueprint_likes.all()), [like])
        self.assertEqual(list(blueprint.likes.all()), [like])
        # Duplicate like by the same user is rejected.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                BlueprintLike.objects.create(user=self.user, blueprint=blueprint)
