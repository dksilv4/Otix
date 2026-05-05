"""Add store_ids JSONB to games for multi-platform support.

Replaces the planned egs_catalog_id column with a generalized store_ids
JSONB dict (platform slug → id) supporting all SGDB platforms: steam,
origin, egs, bnet, uplay, flashpoint, eshop.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "015"
down_revision: str | None = "014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column("store_ids", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("games", "store_ids")
