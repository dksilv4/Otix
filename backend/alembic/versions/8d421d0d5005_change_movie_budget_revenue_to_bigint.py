"""change_movie_budget_revenue_to_bigint

Revision ID: 8d421d0d5005
Revises: 0a1b2c3d4e5f
Create Date: 2026-05-16 14:45:38.687466
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '8d421d0d5005'
down_revision: str | None = '0a1b2c3d4e5f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column('movies', 'budget',
               existing_type=sa.INTEGER(),
               type_=sa.BigInteger(),
               existing_nullable=True)
    op.alter_column('movies', 'revenue',
               existing_type=sa.INTEGER(),
               type_=sa.BigInteger(),
               existing_nullable=True)


def downgrade() -> None:
    op.alter_column('movies', 'revenue',
               existing_type=sa.BigInteger(),
               type_=sa.INTEGER(),
               existing_nullable=True)
    op.alter_column('movies', 'budget',
               existing_type=sa.BigInteger(),
               type_=sa.INTEGER(),
               existing_nullable=True)
