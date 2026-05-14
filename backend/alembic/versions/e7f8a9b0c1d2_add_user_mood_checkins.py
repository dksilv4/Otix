"""add_user_mood_checkins

Revision ID: e7f8a9b0c1d2
Revises: a1b2c3d4e5f6
Create Date: 2026-05-13 18:20:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("daily_mood_checkins_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_table(
        "user_mood_checkins",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.String(length=16), nullable=False),
        sa.Column("checkin_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("mood", sa.String(length=20), nullable=True),
        sa.Column("feeling", sa.String(length=32), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('submitted', 'dismissed')", name="ck_user_mood_checkins_status"),
        sa.CheckConstraint(
            "mood IS NULL OR mood IN ('bad', 'low', 'okay', 'good', 'great')",
            name="ck_user_mood_checkins_mood",
        ),
        sa.CheckConstraint(
            "feeling IS NULL OR feeling IN ("
            "'heartbroken', 'stressed', 'anxious', 'tired', 'lonely', "
            "'bored', 'calm', 'focused', 'excited', 'grateful'"
            ")",
            name="ck_user_mood_checkins_feeling",
        ),
        sa.CheckConstraint(
            "status = 'dismissed' OR mood IS NOT NULL",
            name="ck_user_mood_checkins_submitted_mood",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "checkin_date", name="uq_user_mood_checkins_user_date"),
    )
    op.create_index("ix_user_mood_checkins_user_date", "user_mood_checkins", ["user_id", "checkin_date"])


def downgrade() -> None:
    op.drop_index("ix_user_mood_checkins_user_date", table_name="user_mood_checkins")
    op.drop_table("user_mood_checkins")
    op.drop_column("users", "daily_mood_checkins_enabled")
