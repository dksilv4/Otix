"""Create reviews table and add rating aggregates to media_items.

Revision ID: 016
Revises: 015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("user_id", sa.String(16), primary_key=True),
        sa.Column("media_item_id", sa.String(16), primary_key=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("is_spoiler", sa.Boolean(), nullable=False, server_default=sa.text("false")),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "(score IS NULL) OR (score >= 1 AND score <= 10)",
            name="ck_review_score_range",
        ),
        sa.CheckConstraint(
            "content IS NOT NULL OR score IS NOT NULL",
            name="ck_review_content_or_score",
        ),
    )

    op.add_column("media_items", sa.Column("avg_rating", sa.Float(), nullable=True))
    op.add_column(
        "media_items",
        sa.Column("rating_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    # Backfill aggregates from any existing rated interactions
    op.execute("""
        UPDATE media_items mi
        SET
            avg_rating = sub.avg_score,
            rating_count = sub.cnt
        FROM (
            SELECT
                media_item_id,
                ROUND(AVG(CAST(metadata->>'score' AS numeric)), 2)::float AS avg_score,
                COUNT(*)::int AS cnt
            FROM user_media_interactions
            WHERE interaction_type = 'rated'
              AND metadata ? 'score'
              AND metadata->>'score' ~ '^[0-9]+(\\.[0-9]+)?$'
            GROUP BY media_item_id
        ) sub
        WHERE mi.id = sub.media_item_id
    """)


def downgrade() -> None:
    op.drop_column("media_items", "rating_count")
    op.drop_column("media_items", "avg_rating")
    op.drop_table("reviews")
