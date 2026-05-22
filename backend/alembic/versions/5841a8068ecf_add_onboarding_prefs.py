"""add onboarding_completed, preferred_media_types, preferred_genres, preferred_languages to users

Revision ID: 5841a8068ecf
Revises: 4841a8068ebf
Create Date: 2026-05-21 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '5841a8068ecf'
down_revision: str | None = '4841a8068ebf'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column(
        'onboarding_completed',
        sa.Boolean(),
        nullable=False,
        server_default=sa.text('false'),
    ))
    op.add_column('users', sa.Column(
        'preferred_media_types',
        sa.JSON(),
        nullable=False,
        server_default=sa.text("'[\"movie\", \"show\", \"game\", \"music\"]'::jsonb"),
    ))
    op.add_column('users', sa.Column(
        'preferred_genres',
        sa.JSON(),
        nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    ))
    op.add_column('users', sa.Column(
        'preferred_languages',
        sa.JSON(),
        nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    ))


def downgrade() -> None:
    op.drop_column('users', 'preferred_languages')
    op.drop_column('users', 'preferred_genres')
    op.drop_column('users', 'preferred_media_types')
    op.drop_column('users', 'onboarding_completed')
