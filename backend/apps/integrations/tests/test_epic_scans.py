from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from apps.integrations.models import UserEpicGame


class UserEpicGameModelTests(TestCase):
    def test_unique_per_user_app_name(self):
        user = get_user_model().objects.create_user(username="a", password="pw")
        UserEpicGame.objects.create(user=user, app_name="Jaguar", title="Rocket League")
        with self.assertRaises(IntegrityError):
            UserEpicGame.objects.create(user=user, app_name="Jaguar", title="dupe")
