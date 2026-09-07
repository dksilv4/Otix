"""Add Drive-scoped Google OAuth tokens to users.

Google forbids requesting Drive and YouTube scopes in the same OAuth consent
request, so the Drive backup flow (drive.file scope) stores its tokens
separately from the YouTube-scoped google_* fields.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-20
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("drive_access_token", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("drive_refresh_token", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("drive_token_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "drive_token_expires_at")
    op.drop_column("users", "drive_refresh_token")
    op.drop_column("users", "drive_access_token")
