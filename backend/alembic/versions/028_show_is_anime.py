"""Add is_anime column to shows table.

Mirrors movies.is_anime: detected from TMDB keywords + original_language.
"""

from alembic import op
import sqlalchemy as sa

revision: str = "028"
down_revision: str | None = "027"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "shows",
        sa.Column("is_anime", sa.Boolean, server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("shows", "is_anime")
