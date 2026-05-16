"""add tmdb export stubs

Revision ID: 9b2c3d4e5f6g
Revises: 8a1b2c3d4e5f
Create Date: 2026-05-16 12:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '9b2c3d4e5f6g'
down_revision: str | None = '8a1b2c3d4e5f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # external_ids: make media_item_id nullable
    op.alter_column('external_ids', 'media_item_id',
                    existing_type=sa.String(16), nullable=True)

    # external_ids: add is_adult and media_type
    op.add_column('external_ids',
                  sa.Column('is_adult', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('external_ids',
                  sa.Column('media_type', sa.String(10), nullable=True))

    # external_ids: deduplicate before adding unique constraint
    op.execute("""
        DELETE FROM external_ids a
        USING external_ids b
        WHERE a.ctid < b.ctid
          AND a.provider = b.provider
          AND a.external_id = b.external_id
    """)

    op.create_unique_constraint('uq_external_id_provider_ext', 'external_ids',
                                ['provider', 'external_id'])
    op.create_index('ix_external_ids_stubs', 'external_ids',
                    ['provider', 'media_item_id', 'is_adult', 'created_at'])

    # companies: add tmdb fields
    op.add_column('companies',
                  sa.Column('tmdb_id', sa.Integer(), nullable=True))
    op.create_unique_constraint('uq_companies_tmdb_id', 'companies', ['tmdb_id'])
    op.add_column('companies',
                  sa.Column('logo_url', sa.String(2000), nullable=True))
    op.add_column('companies',
                  sa.Column('origin_country', sa.String(10), nullable=True))

    # keywords: add tmdb_id
    op.add_column('keywords',
                  sa.Column('tmdb_id', sa.Integer(), nullable=True))
    op.create_unique_constraint('uq_keywords_tmdb_id', 'keywords', ['tmdb_id'])


def downgrade() -> None:
    # keywords
    op.drop_constraint('uq_keywords_tmdb_id', 'keywords', type_='unique')
    op.drop_column('keywords', 'tmdb_id')

    # companies
    op.drop_column('companies', 'origin_country')
    op.drop_column('companies', 'logo_url')
    op.drop_constraint('uq_companies_tmdb_id', 'companies', type_='unique')
    op.drop_column('companies', 'tmdb_id')

    # external_ids
    op.drop_index('ix_external_ids_stubs', table_name='external_ids')
    op.drop_constraint('uq_external_id_provider_ext', 'external_ids', type_='unique')
    op.drop_column('external_ids', 'media_type')
    op.drop_column('external_ids', 'is_adult')
    op.alter_column('external_ids', 'media_item_id',
                    existing_type=sa.String(16), nullable=False)
