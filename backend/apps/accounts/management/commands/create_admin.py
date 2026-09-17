"""Management command to create or update an admin/superuser account."""

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create or update an admin user for local development."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default="admin",
            help="Username for the admin user (default: admin)",
        )
        parser.add_argument(
            "--email",
            default="admin@otix.local",
            help="Email for the admin user (default: admin@otix.local)",
        )
        parser.add_argument(
            "--password",
            default="admin123",
            help="Password for the admin user (default: admin123)",
        )

    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]
        password = options["password"]

        user = User.objects.filter(Q(username=username) | Q(email=email)).first()
        if user:
            user.username = username
            user.email = email
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.is_verified = True
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"Admin user updated: username={user.username}, email={user.email} (id={user.id})"
                )
            )
        else:
            user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password,
                is_verified=True,
                is_active=True,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Admin user created: username={user.username}, email={user.email} (id={user.id})"
                )
            )
