"""Add Plex account linking fields.

Revision ID: 038
Revises: 037
Create Date: 2026-05-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "038"
down_revision: str | None = "037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("plex_id", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("plex_username", sa.String(150), nullable=True))
    op.add_column("users", sa.Column("plex_email", sa.String(320), nullable=True))
    op.add_column("users", sa.Column("plex_thumb", sa.String(2048), nullable=True))
    op.add_column("users", sa.Column("plex_auth_token", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_users_plex_id", "users", ["plex_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_plex_id", "users", type_="unique")
    op.drop_column("users", "plex_auth_token")
    op.drop_column("users", "plex_thumb")
    op.drop_column("users", "plex_email")
    op.drop_column("users", "plex_username")
    op.drop_column("users", "plex_id")
