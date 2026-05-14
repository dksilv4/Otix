"""add_track_ratings

Revision ID: f4e5d6c7b8a9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-14 13:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f4e5d6c7b8a9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("avg_rating", sa.Float(), nullable=True))
    op.add_column("tracks", sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "track_ratings",
        sa.Column("user_id", sa.String(length=16), nullable=False),
        sa.Column("track_id", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("score >= 1 AND score <= 10", name="ck_track_rating_score_range"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "track_id"),
    )
    op.create_index("ix_track_ratings_track_id", "track_ratings", ["track_id"])
    op.alter_column("tracks", "rating_count", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_track_ratings_track_id", table_name="track_ratings")
    op.drop_table("track_ratings")
    op.drop_column("tracks", "rating_count")
    op.drop_column("tracks", "avg_rating")
