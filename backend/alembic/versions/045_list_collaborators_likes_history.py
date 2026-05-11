"""Add list collaborators, likes, and rank history"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "045"
down_revision: str | None = "044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # media_list_collaborators
    op.create_table(
        "media_list_collaborators",
        sa.Column("id", sa.String(16), nullable=False),
        sa.Column("list_id", sa.String(16), sa.ForeignKey("user_list.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission", sa.String(10), nullable=False, server_default="VIEW"),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "user_id", name="uq_list_collaborator"),
    )

    # media_list_likes
    op.create_table(
        "media_list_likes",
        sa.Column("id", sa.String(16), nullable=False),
        sa.Column("list_id", sa.String(16), sa.ForeignKey("user_list.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "user_id", name="uq_list_like"),
    )

    # list_item_rank_history
    op.create_table(
        "list_item_rank_history",
        sa.Column("id", sa.String(16), nullable=False),
        sa.Column("list_id", sa.String(16), sa.ForeignKey("user_list.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("old_sort_order", sa.Integer(), nullable=False),
        sa.Column("new_sort_order", sa.Integer(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("list_item_rank_history")
    op.drop_table("media_list_likes")
    op.drop_table("media_list_collaborators")
