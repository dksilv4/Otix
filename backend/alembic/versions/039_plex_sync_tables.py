"""Add Plex sync tables.

Revision ID: 039
Revises: 038
Create Date: 2026-05-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "039"
down_revision: str | None = "038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "user_plex_servers",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("user_id", sa.String(26), nullable=False),
        sa.Column("machine_identifier", sa.String(128), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("product", sa.String(100), nullable=True),
        sa.Column("platform", sa.String(100), nullable=True),
        sa.Column("base_url", sa.String(2048), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("owned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("selected", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "machine_identifier", name="uq_user_plex_server"),
    )
    op.create_table(
        "user_plex_libraries",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("user_id", sa.String(26), nullable=False),
        sa.Column("server_id", sa.String(26), nullable=False),
        sa.Column("section_key", sa.String(64), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("library_type", sa.String(20), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["server_id"], ["user_plex_servers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("server_id", "section_key", name="uq_user_plex_library"),
    )
    op.create_table(
        "user_plex_items",
        sa.Column("id", sa.String(26), nullable=False),
        sa.Column("user_id", sa.String(26), nullable=False),
        sa.Column("server_id", sa.String(26), nullable=False),
        sa.Column("library_id", sa.String(26), nullable=True),
        sa.Column("media_item_id", sa.String(26), nullable=True),
        sa.Column("rating_key", sa.String(128), nullable=False),
        sa.Column("guid", sa.String(512), nullable=True),
        sa.Column("media_type", sa.String(20), nullable=False),
        sa.Column("title", sa.String(1000), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("thumb_url", sa.String(2048), nullable=True),
        sa.Column("viewed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("view_offset", sa.Integer(), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("guids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["server_id"], ["user_plex_servers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["library_id"], ["user_plex_libraries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("server_id", "rating_key", name="uq_user_plex_item"),
    )


def downgrade() -> None:
    op.drop_table("user_plex_items")
    op.drop_table("user_plex_libraries")
    op.drop_table("user_plex_servers")
