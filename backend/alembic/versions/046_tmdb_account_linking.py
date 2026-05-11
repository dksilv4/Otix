"""Add TMDb account linking columns to users"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "046"
down_revision: str | None = "045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("tmdb_session_id", sa.String(64), unique=True, nullable=True))
    op.add_column("users", sa.Column("tmdb_account_id", sa.BigInteger(), unique=True, nullable=True))
    op.add_column("users", sa.Column("tmdb_username", sa.String(150), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "tmdb_username")
    op.drop_column("users", "tmdb_account_id")
    op.drop_column("users", "tmdb_session_id")
