"""Add user_list and user_list_item tables."""

import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"


def upgrade() -> None:
    op.create_table(
        "user_list",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(16),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_user_list_user", "user_list", ["user_id"])

    op.create_table(
        "user_list_item",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column(
            "list_id",
            sa.String(16),
            sa.ForeignKey("user_list.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "media_item_id",
            sa.String(16),
            sa.ForeignKey("media_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column(
            "added_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("list_id", "media_item_id"),
    )
    op.create_index("idx_user_list_item_list", "user_list_item", ["list_id", "sort_order"])


def downgrade() -> None:
    op.drop_table("user_list_item")
    op.drop_table("user_list")
