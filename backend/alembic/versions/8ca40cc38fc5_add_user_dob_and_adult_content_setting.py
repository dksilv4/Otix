"""add_user_dob_and_adult_content_setting

Revision ID: 8ca40cc38fc5
Revises: a7f3c2d1e5b9
Create Date: 2026-05-24 16:39:38.609843
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '8ca40cc38fc5'
down_revision: str | None = 'a7f3c2d1e5b9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("show_adult_content", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "show_adult_content")
    op.drop_column("users", "date_of_birth")
