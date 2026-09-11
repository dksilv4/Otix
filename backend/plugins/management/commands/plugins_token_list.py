"""List plugin gateway tokens and their scopes (never the secret)."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from plugins.models import PluginAccessToken


class Command(BaseCommand):
    help = "List plugin gateway API tokens (scopes shown, secrets never)."

    def handle(self, *args, **options) -> None:
        tokens = PluginAccessToken.objects.prefetch_related("grants")
        if not tokens.exists():
            self.stdout.write("No plugin access tokens.")
            return
        for token in tokens:
            scopes = []
            for grant in token.grants.all():
                scopes.append(
                    f"{grant.plugin}:{grant.method_prefix}"
                    if grant.method_prefix
                    else grant.plugin
                )
            state = "active" if token.is_active else "revoked"
            expires = token.expires_at.isoformat() if token.expires_at else "never"
            self.stdout.write(
                f"[{token.id}] {token.name}  ({state}, prefix={token.prefix}, "
                f"expires={expires})  scope={', '.join(scopes)}"
            )
