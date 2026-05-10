"""Add user_sessions table for session management.

Revision ID: 035
Revises: 14c15e62dbef
Create Date: 2026-05-09
"""

import sqlalchemy as sa
from alembic import op

revision: str = "035"
down_revision: str | None = "14c15e62dbef"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_key", sa.String(36), unique=True, nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_sessions_user_active", "user_sessions", ["user_id", "revoked_at"])


def downgrade() -> None:
    op.drop_table("user_sessions")
