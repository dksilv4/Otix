"""add user country preference

Revision ID: 9f1a2b3c4d5e
Revises: fe6b8c45531c
Create Date: 2026-05-27
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '9f1a2b3c4d5e'
down_revision: Union[str, None] = '8e9f0d4c3b2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('country', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'country')
