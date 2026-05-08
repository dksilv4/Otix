"""Add avatar_url to users table."""

import sqlalchemy as sa
from alembic import op

revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
