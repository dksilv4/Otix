"""add_embeddings_to_user_person_company

Revision ID: 67fa8bdf58b5
Revises: 1a2b3c4d5e6f
Create Date: 2026-06-15 15:49:47.535953
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
import pgvector

revision: str = '67fa8bdf58b5'
down_revision: str | None = '1a2b3c4d5e6f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_embedding_column(table: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns(table)]
    if "embedding" not in columns:
        op.add_column(table, sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True))


def _add_hnsw_index(table: str) -> None:
    idx_name = f"ix_{table}_embedding_hnsw"
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = [i["name"] for i in inspector.get_indexes(table)]
    if idx_name not in existing:
        op.create_index(idx_name, table, ['embedding'], unique=False, postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    _add_embedding_column('companies')
    _add_hnsw_index('companies')

    _add_embedding_column('people')
    _add_hnsw_index('people')

    _add_embedding_column('users')
    _add_hnsw_index('users')


def downgrade() -> None:
    op.drop_index('ix_users_embedding_hnsw', table_name='users', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_column('users', 'embedding')
    
    op.drop_index('ix_people_embedding_hnsw', table_name='people', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_column('people', 'embedding')
    
    op.drop_index('ix_companies_embedding_hnsw', table_name='companies', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_column('companies', 'embedding')
