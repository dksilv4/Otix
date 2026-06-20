"""Add match_skips table for tracking permanently rejected game matches.

Revision ID: b8g4h5d2e1c0
Revises: a7f3e2d1c0b9
Create Date: 2026-06-20 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "b8g4h5d2e1c0"
down_revision: str | None = "a7f3e2d1c0b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "match_skips",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column(
            "skipped_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(16),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("provider", "external_id", name="uq_match_skip_provider_ext"),
        sa.Index("ix_match_skip_provider_ext", "provider", "external_id"),
    )


def downgrade() -> None:
    op.drop_table("match_skips")
