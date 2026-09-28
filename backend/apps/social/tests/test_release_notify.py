"""Tests for studio release notifications (``apps.social.services.release_notify``
and the ``apps.social.tasks`` wrappers).

Covers the fan-out + dedupe, the ``studio_release`` preference gate, the
announced/available split, the recent-release window and the beat sweep's
followed-and-released filter. The tasks are called directly (no broker); web-push
is asserted via the ``Notification`` post_save signal path.
"""

from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.company.models import Company, InvolvedCompany, UserCompanyFollow
from apps.media.models import MediaItem
from apps.social.models import Notification
from apps.social.services import release_notify
from apps.social.tasks import notify_release_transitions_task, release_notify_task

User = get_user_model()


class ReleaseNotifyTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.company = Company.objects.create(name="A24", slug="a24")
        UserCompanyFollow.objects.create(user=self.user, company=self.company)

    def _media(self, *, release_date=None, slug="the-death-of-robin-hood", title=None):
        media = MediaItem.objects.create(
            media_type="movie",
            title=title or "The Death of Robin Hood",
            slug=slug,
            release_date=release_date,
        )
        InvolvedCompany.objects.create(media_item=media, company=self.company, distributor=True)
        return media

    # ── fan-out ────────────────────────────────────────────────────────────

    def test_creates_notification_for_follower(self) -> None:
        media = self._media(release_date=timezone.localdate() + timedelta(days=30))
        created = release_notify.notify_company_followers(media.pk, kind="announced")
        self.assertEqual(len(created), 1)
        notification = Notification.objects.get()
        self.assertEqual(notification.type, "studio_release")
        self.assertEqual(notification.user_id, self.user.pk)
        self.assertEqual(notification.metadata_json["companyName"], "A24")
        self.assertEqual(notification.metadata_json["mediaId"], media.pk)
        self.assertIn("A24", notification.title)

    def test_dedupe_prevents_repeat(self) -> None:
        media = self._media()
        release_notify.notify_company_followers(media.pk, kind="announced")
        again = release_notify.notify_company_followers(media.pk, kind="announced")
        self.assertEqual(again, [])
        self.assertEqual(Notification.objects.count(), 1)

    def test_announced_and_available_are_distinct(self) -> None:
        media = self._media()
        release_notify.notify_company_followers(media.pk, kind="announced")
        release_notify.notify_company_followers(media.pk, kind="available")
        self.assertEqual(Notification.objects.count(), 2)

    def test_preference_off_skips_user(self) -> None:
        self.user.notification_preferences = {"studio_release": False}
        self.user.save(update_fields=["notification_preferences"])
        media = self._media()
        self.assertEqual(release_notify.notify_company_followers(media.pk, kind="announced"), [])

    def test_no_followers_is_noop(self) -> None:
        UserCompanyFollow.objects.all().delete()
        media = self._media()
        self.assertEqual(release_notify.notify_company_followers(media.pk, kind="announced"), [])

    def test_missing_media_is_noop(self) -> None:
        self.assertEqual(release_notify.notify_company_followers(999999, kind="announced"), [])

    # ── helpers ────────────────────────────────────────────────────────────

    def test_media_has_followed_company(self) -> None:
        media = self._media()
        self.assertTrue(release_notify.media_has_followed_company(media.pk))
        UserCompanyFollow.objects.all().delete()
        self.assertFalse(release_notify.media_has_followed_company(media.pk))

    def test_is_recent_release_window(self) -> None:
        today = timezone.localdate()
        self.assertTrue(release_notify.is_recent_release(self._media(release_date=None)))
        self.assertTrue(
            release_notify.is_recent_release(
                self._media(release_date=today - timedelta(days=10), slug="recent")
            )
        )
        self.assertFalse(
            release_notify.is_recent_release(
                self._media(release_date=today - timedelta(days=400), slug="old")
            )
        )

    def test_kind_for_splits_on_release_date(self) -> None:
        today = timezone.localdate()
        self.assertEqual(release_notify.kind_for(self._media(release_date=None)), "announced")
        self.assertEqual(
            release_notify.kind_for(
                self._media(release_date=today + timedelta(days=5), slug="future")
            ),
            "announced",
        )
        self.assertEqual(
            release_notify.kind_for(self._media(release_date=today, slug="today")),
            "available",
        )


class ReleaseTransitionTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="bob", password="a-strong-pass")
        self.company = Company.objects.create(name="A24", slug="a24")
        UserCompanyFollow.objects.create(user=self.user, company=self.company)

    def _media(self, release_date, slug):
        media = MediaItem.objects.create(
            media_type="movie", title="Title", slug=slug, release_date=release_date
        )
        InvolvedCompany.objects.create(media_item=media, company=self.company)
        return media

    def test_transitioning_titles_filters_followed_and_recent(self) -> None:
        today = timezone.localdate()
        released = self._media(today, "released-today")
        self._media(today - timedelta(days=400), "old")
        # A released-today title with no followed studio is excluded.
        other = Company.objects.create(name="Other", slug="other")
        no_follow = MediaItem.objects.create(
            media_type="movie", title="Other", slug="other-today", release_date=today
        )
        InvolvedCompany.objects.create(media_item=no_follow, company=other)

        ids = set(release_notify.transitioning_titles().values_list("pk", flat=True))
        self.assertIn(released.pk, ids)
        self.assertNotIn(no_follow.pk, ids)


class ReleaseTaskTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="carol", password="a-strong-pass")
        self.company = Company.objects.create(name="A24", slug="a24")
        UserCompanyFollow.objects.create(user=self.user, company=self.company)

    def _media(self, release_date, slug):
        media = MediaItem.objects.create(
            media_type="movie", title="Title", slug=slug, release_date=release_date
        )
        InvolvedCompany.objects.create(media_item=media, company=self.company)
        return media

    @mock.patch("apps.social.signals.send_notification")
    def test_task_notifies_recent_title_and_pushes(self, send) -> None:
        media = self._media(timezone.localdate() + timedelta(days=20), "upcoming")
        with self.captureOnCommitCallbacks(execute=True):
            created = release_notify_task(media.pk)
        self.assertEqual(created, 1)
        send.assert_called_once()
        self.assertEqual(Notification.objects.get().metadata_json["kind"], "announced")

    def test_task_skips_stale_title(self) -> None:
        media = self._media(timezone.localdate() - timedelta(days=400), "stale")
        self.assertEqual(release_notify_task(media.pk), 0)

    @mock.patch("apps.social.signals.send_notification")
    def test_transition_task_sends_available(self, send) -> None:
        self._media(timezone.localdate(), "today")
        with self.captureOnCommitCallbacks(execute=True):
            created = notify_release_transitions_task()
        self.assertEqual(created, 1)
        send.assert_called_once()
        self.assertEqual(Notification.objects.get().metadata_json["kind"], "available")
