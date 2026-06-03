"""separate ratings from reviews into their own table

Revision ID: j1k2l3m4n5o6
Revises: i9j0k1l2m3n4
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j1k2l3m4n5o6"
down_revision: str | None = "i9j0k1l2m3n4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create the new media_item_ratings table
    op.create_table(
        "media_item_ratings",
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.CheckConstraint("score >= 1 AND score <= 10", name="ck_media_item_rating_score_range"),
    )

    # 2. Migrate existing scores from reviews table into media_item_ratings
    op.execute("""
        INSERT INTO media_item_ratings (user_id, media_item_id, score, created_at, updated_at)
        SELECT user_id, media_item_id, score, created_at, updated_at
        FROM reviews
        WHERE score IS NOT NULL
    """)

    # 3. Drop the old review_content_or_score check constraint
    op.drop_constraint("ck_review_content_or_score", "reviews", type_="check")

    # 4. Drop the score column from reviews
    op.drop_column("reviews", "score")

    # 5. Add a new check constraint ensuring reviews always have content
    op.create_check_constraint(
        "ck_review_has_content",
        "reviews",
        "content IS NOT NULL",
    )

    # 6. Recalculate avg_rating and rating_count on all media items
    op.execute("""
        UPDATE media_items m
        SET
            avg_rating = subq.avg_score,
            rating_count = subq.cnt
        FROM (
            SELECT
                media_item_id,
                ROUND(AVG(score)::numeric, 2)::double precision AS avg_score,
                COUNT(*) AS cnt
            FROM media_item_ratings
            GROUP BY media_item_id
        ) subq
        WHERE m.id = subq.media_item_id
    """)
    # Zero out media items that no longer have any ratings
    op.execute("""
        UPDATE media_items
        SET avg_rating = NULL, rating_count = 0
        WHERE id NOT IN (SELECT media_item_id FROM media_item_ratings)
    """)


def downgrade() -> None:
    # 1. Drop the new check constraint
    op.drop_constraint("ck_review_has_content", "reviews", type_="check")

    # 2. Re-add score column to reviews
    op.add_column("reviews", sa.Column("score", sa.Integer(), nullable=True))

    # 3. Migrate data back from media_item_ratings
    op.execute("""
        UPDATE reviews r
        SET score = mir.score
        FROM media_item_ratings mir
        WHERE r.user_id = mir.user_id AND r.media_item_id = mir.media_item_id
    """)

    # 4. Restore the original check constraint
    op.create_check_constraint(
        "ck_review_content_or_score",
        "reviews",
        "(score IS NULL) OR (score >= 1 AND score <= 10)",
    )
    op.create_check_constraint(
        "ck_review_score_range",
        "reviews",
        "(score IS NULL) OR (score >= 1 AND score <= 10)",
    )

    # 5. Drop the media_item_ratings table
    op.drop_table("media_item_ratings")
