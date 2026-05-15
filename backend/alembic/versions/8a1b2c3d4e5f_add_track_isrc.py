"""add track isrc

Revision ID: 8a1b2c3d4e5f
Revises: 7f049a1f57db
Create Date: 2026-05-15 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '8a1b2c3d4e5f'
down_revision: str | None = '7f049a1f57db'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tracks', sa.Column('isrc', sa.String(length=20), nullable=True))
    op.create_unique_constraint('uq_tracks_isrc', 'tracks', ['isrc'])


def downgrade() -> None:
    op.drop_constraint('uq_tracks_isrc', 'tracks', type_='unique')
    op.drop_column('tracks', 'isrc')
