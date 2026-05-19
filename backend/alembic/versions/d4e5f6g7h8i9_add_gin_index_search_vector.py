"""add GIN index on media_items.search_vector

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-05-19 18:35:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'd4e5f6g7h8i9'
down_revision: str | None = 'c3d4e5f6g7h8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        'ix_media_items_search_vector',
        'media_items',
        ['search_vector'],
        postgresql_using='gin',
    )


def downgrade() -> None:
    op.drop_index('ix_media_items_search_vector', table_name='media_items')
