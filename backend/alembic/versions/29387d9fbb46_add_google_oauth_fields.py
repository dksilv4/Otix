"""add_google_oauth_fields

Revision ID: 29387d9fbb46
Revises: b2c3d4e5f6g7
Create Date: 2026-05-18 17:45:24.898750
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '29387d9fbb46'
down_revision: str | None = 'b2c3d4e5f6g7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('google_id', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('google_email', sa.String(length=320), nullable=True))
    op.add_column('users', sa.Column('google_name', sa.String(length=150), nullable=True))
    op.add_column('users', sa.Column('google_avatar_url', sa.String(length=2048), nullable=True))
    op.add_column('users', sa.Column('google_access_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('google_refresh_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('google_token_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint(None, 'users', ['google_id'])


def downgrade() -> None:
    op.drop_constraint(None, 'users', type_='unique')
    op.drop_column('users', 'google_token_expires_at')
    op.drop_column('users', 'google_refresh_token')
    op.drop_column('users', 'google_access_token')
    op.drop_column('users', 'google_avatar_url')
    op.drop_column('users', 'google_name')
    op.drop_column('users', 'google_email')
    op.drop_column('users', 'google_id')
