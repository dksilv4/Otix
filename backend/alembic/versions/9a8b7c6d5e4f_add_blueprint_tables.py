"""add blueprint tables

Revision ID: 9a8b7c6d5e4f
Revises: 3d46508f1384
Create Date: 2026-06-25 09:30:00.000000

"""

from __future__ import annotations

from typing import ClassVar

import sqlalchemy as sa
from alembic import op

revision: str = "9a8b7c6d5e4f"
down_revision: str | None = "3d46508f1384"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "blueprints",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("blueprint_string", sa.Text(), nullable=False),
        sa.Column("parsed_data", sa.JSON(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("downloads", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_blueprints_created_at", "blueprints", ["created_at"])
    op.create_index("idx_blueprints_user_id", "blueprints", ["user_id"])

    op.create_table(
        "blueprint_likes",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blueprint_id", sa.String(16), sa.ForeignKey("blueprints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "blueprint_id", name="uq_blueprint_like"),
    )
    op.create_index("idx_blueprint_likes_blueprint_id", "blueprint_likes", ["blueprint_id"])


def downgrade() -> None:
    op.drop_table("blueprint_likes")
    op.drop_table("blueprints")
