"""Add interaction count columns to media_items."""

import sqlalchemy as sa
from alembic import op

revision = "019"
down_revision = "018"


def upgrade() -> None:
    for col, interaction_type in [
        ("like_count", "liked"),
        ("watchlist_count", "watchlisted"),
        ("watched_count", "watched"),
        ("played_count", "played"),
    ]:
        op.add_column(
            "media_items",
            sa.Column(col, sa.Integer(), nullable=False, server_default=sa.text("0")),
        )

    for col, interaction_type in [
        ("like_count", "liked"),
        ("watchlist_count", "watchlisted"),
        ("watched_count", "watched"),
        ("played_count", "played"),
    ]:
        op.execute(
            sa.text(f"""
                UPDATE media_items mi
                SET {col} = sub.cnt
                FROM (
                    SELECT media_item_id, COUNT(*)::int AS cnt
                    FROM user_media_interactions
                    WHERE interaction_type = '{interaction_type}'
                    GROUP BY media_item_id
                ) sub
                WHERE mi.id = sub.media_item_id
            """)
        )


def downgrade() -> None:
    op.drop_column("media_items", "like_count")
    op.drop_column("media_items", "watchlist_count")
    op.drop_column("media_items", "watched_count")
    op.drop_column("media_items", "played_count")
