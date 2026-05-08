"""Add bio and background_url columns to users table."""

from alembic import op
import sqlalchemy as sa

revision: str = "031"
down_revision: str | None = "030"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bio", sa.Text, nullable=True))
    op.add_column("users", sa.Column("background_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "background_url")
    op.drop_column("users", "bio")
