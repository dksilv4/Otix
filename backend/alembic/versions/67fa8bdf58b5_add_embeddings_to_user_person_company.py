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


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column('companies', sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True))
    op.create_index('ix_companies_embedding_hnsw', 'companies', ['embedding'], unique=False, postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    
    op.add_column('people', sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True))
    op.create_index('ix_people_embedding_hnsw', 'people', ['embedding'], unique=False, postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    
    op.add_column('users', sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True))
    op.create_index('ix_users_embedding_hnsw', 'users', ['embedding'], unique=False, postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})


def downgrade() -> None:
    op.drop_index('ix_users_embedding_hnsw', table_name='users', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_column('users', 'embedding')
    
    op.drop_index('ix_people_embedding_hnsw', table_name='people', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_column('people', 'embedding')
    
    op.drop_index('ix_companies_embedding_hnsw', table_name='companies', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'})
    op.drop_column('companies', 'embedding')
