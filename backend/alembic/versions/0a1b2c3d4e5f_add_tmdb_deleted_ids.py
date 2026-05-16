"""add tmdb_deleted_ids table

Revision ID: 0a1b2c3d4e5f
Revises: 9b2c3d4e5f6g
Create Date: 2026-05-16 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '0a1b2c3d4e5f'
down_revision: str | None = '9b2c3d4e5f6g'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'tmdb_deleted_ids',
        sa.Column('id', sa.String(16), primary_key=True),
        sa.Column('tmdb_id', sa.Integer(), nullable=False),
        sa.Column('media_type', sa.String(10), nullable=False),
        sa.Column('media_item_id', sa.String(16), nullable=True),
        sa.Column('title', sa.String(1000), nullable=True),
        sa.Column(
            'detection_date',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint('tmdb_id', 'media_type', name='uq_tmdb_deleted_id'),
    )
    op.create_index(
        'ix_tmdb_deleted_ids_type_date',
        'tmdb_deleted_ids',
        ['media_type', 'detection_date'],
    )


def downgrade() -> None:
    op.drop_index('ix_tmdb_deleted_ids_type_date', table_name='tmdb_deleted_ids')
    op.drop_table('tmdb_deleted_ids')
