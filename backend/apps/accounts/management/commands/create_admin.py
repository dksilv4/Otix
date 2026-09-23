"""Management command to create or update an admin/superuser account interactively."""

import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create or update an admin/superuser account (interactive prompt by default)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default=None,
            help="Username for the admin user.",
        )
        parser.add_argument(
            "--email",
            default=None,
            help="Email address for the admin user.",
        )
        parser.add_argument(
            "--password",
            default=None,
            help="Password for the admin user.",
        )
        parser.add_argument(
            "--no-input",
            "--noinput",
            action="store_true",
            help="Do not prompt for input. Flags must be provided.",
        )

    def handle(self, *args, **options):
        username = options.get("username")
        email = options.get("email")
        password = options.get("password")
        no_input = options.get("no_input", False)

        # 1. Username
        if not username:
            if no_input:
                raise CommandError(
                    "Username must be provided with --username when --no-input is used."
                )
            while not username:
                username = input("Username: ").strip()
                if not username:
                    self.stderr.write("Username cannot be blank.")

        # 2. Email
        if not email:
            if no_input:
                raise CommandError("Email must be provided with --email when --no-input is used.")
            while not email:
                email = input("Email address: ").strip()
                if not email:
                    self.stderr.write("Email address cannot be blank.")

        # 3. Password
        if not password:
            if no_input:
                raise CommandError(
                    "Password must be provided with --password when --no-input is used."
                )
            while not password:
                pwd1 = getpass.getpass("Password: ")
                if not pwd1:
                    self.stderr.write("Password cannot be blank.")
                    continue
                pwd2 = getpass.getpass("Password (again): ")
                if pwd1 != pwd2:
                    self.stderr.write("Error: Your passwords didn't match.")
                    continue
                try:
                    validate_password(pwd1)
                except ValidationError as err:
                    self.stderr.write("\n".join(err.messages))
                    try:
                        override = input("Bypass password validation? (y/N): ").strip().lower()
                    except (EOFError, KeyboardInterrupt):
                        raise CommandError("Aborted.") from None
                    if override != "y":
                        continue
                password = pwd1

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
                    f"Superuser updated: {user.username} ({user.email}) [id={user.id}]"
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
                    f"Superuser created: {user.username} ({user.email}) [id={user.id}]"
                )
            )
