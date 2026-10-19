"""Management command to send realistic test notifications to a user.

Usage:
    python manage.py send_test_notifications [--user admin] [--clear]
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.lists.models import UserList
from apps.media.models import MediaItem
from apps.social.models import Notification


class Command(BaseCommand):
    help = "Send a diverse set of test notifications to a user for UI verification."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--user",
            type=str,
            default="admin",
            help="Username to receive test notifications (default: 'admin').",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing notifications for the user before sending test notifications.",
        )

    def handle(self, *args, **options) -> None:
        username: str = options["user"]
        clear: bool = options["clear"]

        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if not user:
            raise CommandError(f"User '{username}' does not exist.")

        if clear:
            deleted_count, _ = Notification.objects.filter(user=user).delete()
            self.stdout.write(
                self.style.WARNING(
                    f"Cleared {deleted_count} existing notifications for '{username}'."
                )
            )

        # Pick dynamic references if available
        movie = MediaItem.objects.filter(media_type="movie").first()
        game = MediaItem.objects.filter(media_type="game").first()
        show = MediaItem.objects.filter(media_type="show").first()
        user_list = UserList.objects.first()

        movie_id = movie.id if movie else 1
        movie_title = movie.title if movie else "Moneyball"
        game_id = game.id if game else 2
        game_title = game.title if game else "Squad"
        show_id = show.id if show else 3
        show_title = show.title if show else "Breaking Bad"
        list_id = user_list.id if user_list else 1
        list_name = user_list.name if user_list else "Favorites"

        test_data = [
            {
                "type": "release_available",
                "title": f"Now Available: {movie_title}",
                "body": f"'{movie_title}' is now streaming in your library.",
                "metadata_json": {"media_type": "movie", "media_id": movie_id},
                "is_read": False,
            },
            {
                "type": "new_season",
                "title": f"New Season: {show_title}",
                "body": f"Season 2 of '{show_title}' has just premiered.",
                "metadata_json": {
                    "media_type": "show",
                    "media_id": show_id,
                    "season_number": 2,
                },
                "is_read": False,
            },
            {
                "type": "release_available",
                "title": f"Game Update: {game_title}",
                "body": f"A major update for '{game_title}' is ready to play.",
                "metadata_json": {"media_type": "game", "media_id": game_id},
                "is_read": False,
            },
            {
                "type": "friend_request",
                "title": "Friend Request from bob",
                "body": "bob sent you a friend request.",
                "metadata_json": {
                    "request_id": 101,
                    "sender_username": "bob",
                    "username": "bob",
                },
                "is_read": False,
            },
            {
                "type": "friend_accepted",
                "title": "worker accepted your friend request",
                "body": "You and worker are now connected.",
                "metadata_json": {"username": "worker"},
                "is_read": False,
            },
            {
                "type": "list_invitation",
                "title": f"Invitation: '{list_name}'",
                "body": f"bob invited you to collaborate on the list '{list_name}'.",
                "metadata_json": {"list_id": list_id},
                "is_read": False,
            },
            {
                "type": "system",
                "title": "System Alert: Maintenance Completed",
                "body": "Background telemetry and library sync jobs completed successfully.",
                "metadata_json": {},
                "is_read": False,
            },
            {
                "type": "system",
                "title": "Welcome to Otix",
                "body": "Review your integration settings and connected accounts.",
                "metadata_json": {"link": "/settings/integrations"},
                "is_read": False,
            },
            {
                "type": "user_rating",
                "title": "bob rated your item",
                "body": f"bob gave 5 stars to '{movie_title}'.",
                "metadata_json": {"rater_username": "bob"},
                "is_read": False,
            },
            {
                "type": "integration_disconnected",
                "title": "Integration Notice: Connection verified",
                "body": "Plex integration token was refreshed.",
                "metadata_json": {},
                "is_read": True,
            },
        ]

        created_notifications = []
        with transaction.atomic():
            for item in test_data:
                notif = Notification.objects.create(
                    user=user,
                    type=item["type"],
                    title=item["title"],
                    body=item["body"],
                    metadata_json=item["metadata_json"],
                    is_read=item["is_read"],
                    read_at=timezone.now() if item["is_read"] else None,
                )
                created_notifications.append(notif)

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully sent {len(created_notifications)} test notifications to '{username}'."
            )
        )
