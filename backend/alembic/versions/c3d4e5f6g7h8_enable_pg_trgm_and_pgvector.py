"""enable pg_trgm and pgvector extensions

Revision ID: c3d4e5f6g7h8
Revises: 4a5b6c7d8e9f
Create Date: 2026-05-19 18:20:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'c3d4e5f6g7h8'
down_revision: str | None = '4a5b6c7d8e9f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
