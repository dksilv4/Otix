"""add search performance indexes

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-05-31
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'g7h8i9j0k1l2'
down_revision: str | None = 'f6g7h8i9j0k1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # GIN index for full-text search (search_vector @@ tsquery)
    op.create_index(
        'ix_media_items_search_vector',
        'media_items',
        ['search_vector'],
        postgresql_using='gin',
    )
    # GiST trigram index for fuzzy title matching (title % query)
    op.create_index(
        'ix_media_items_title_trgm',
        'media_items',
        ['title'],
        postgresql_using='gist',
        postgresql_ops={'title': 'gist_trgm_ops'},
    )
    # GIN trigram index for person name matching (people.name % query)
    op.create_index(
        'ix_people_name_trgm',
        'people',
        ['name'],
        postgresql_using='gin',
        postgresql_ops={'name': 'gin_trgm_ops'},
    )
    # Join indexes for media_credits (person-based search branch)
    op.create_index(
        'ix_media_credits_media_item_id',
        'media_credits',
        ['media_item_id'],
    )
    op.create_index(
        'ix_media_credits_person_id',
        'media_credits',
        ['person_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_media_credits_person_id')
    op.drop_index('ix_media_credits_media_item_id')
    op.drop_index('ix_people_name_trgm')
    op.drop_index('ix_media_items_title_trgm')
    op.drop_index('ix_media_items_search_vector')
