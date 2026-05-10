"""Add auth_action_tokens table for email verification and password reset.

Revision ID: 033
Revises: 2684c21b5b1a
Create Date: 2026-05-09
"""

import sqlalchemy as sa
from alembic import op

revision: str = "033"
down_revision: str | None = "2684c21b5b1a"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "auth_action_tokens",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auth_action_tokens_user_purpose", "auth_action_tokens", ["user_id", "purpose"])
    op.create_index("ix_auth_action_tokens_token_hash", "auth_action_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_table("auth_action_tokens")
