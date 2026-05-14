"""add_user_admin_flag

Revision ID: g5h6i7j8k9l0
Revises: f4e5d6c7b8a9
Create Date: 2026-05-14 14:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "g5h6i7j8k9l0"
down_revision: str | None = "f4e5d6c7b8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute(
        """
        UPDATE users
        SET is_admin = true
        WHERE lower(username) = 'demo'
           OR lower(email) LIKE 'demo@%'
        """
    )


def downgrade() -> None:
    op.drop_column("users", "is_admin")
