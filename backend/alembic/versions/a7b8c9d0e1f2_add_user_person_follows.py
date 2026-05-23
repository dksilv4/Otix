"""add_user_person_follows

Revision ID: a7b8c9d0e1f2
Revises: fe6b8c45531c
Create Date: 2026-05-23 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: str | None = 'fe6b8c45531c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_person_follows",
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("person_id", sa.String(16), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_person_follows_user_id", "user_person_follows", ["user_id"])
    op.create_index("ix_user_person_follows_person_id", "user_person_follows", ["person_id"])


def downgrade() -> None:
    op.drop_index("ix_user_person_follows_person_id")
    op.drop_index("ix_user_person_follows_user_id")
    op.drop_table("user_person_follows")
