"""add user ratings and profile sections

Revision ID: 048
Revises: e7f8a9b0c1d2
Create Date: 2026-05-13 19:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "048"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_PROFILE_SECTIONS = ["reviews", "stats", "top_rated", "recent_activity"]


def upgrade() -> None:
    # Add aggregate rating columns and profile sections to users
    op.add_column("users", sa.Column("avg_user_rating", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("user_rating_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(
        "users",
        sa.Column("profile_sections", sa.JSON(), nullable=False, server_default=sa.text(f"'{DEFAULT_PROFILE_SECTIONS}'")),
    )

    # Create user_ratings table
    op.create_table(
        "user_ratings",
        sa.Column("rater_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("rated_user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("score >= 1 AND score <= 10", name="ck_user_rating_score_range"),
    )


def downgrade() -> None:
    op.drop_table("user_ratings")
    op.drop_column("users", "profile_sections")
    op.drop_column("users", "user_rating_count")
    op.drop_column("users", "avg_user_rating")
