"""add_profile_card_sections

Revision ID: 4841a8068ebf
Revises: d4e5f6g7h8i9
Create Date: 2026-05-20 00:32:05.087984
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '4841a8068ebf'
down_revision: str | None = 'd4e5f6g7h8i9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column(
        'profile_card_sections',
        sa.JSON(),
        nullable=False,
        server_default=sa.text("'[\"reviews\", \"stats\", \"top_rated\", \"recent_activity\"]'::jsonb")
    ))


def downgrade() -> None:
    op.drop_column('users', 'profile_card_sections')
