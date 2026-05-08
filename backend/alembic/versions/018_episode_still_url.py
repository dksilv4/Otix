"""Add still_url to episodes."""

import sqlalchemy as sa
from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("episodes", sa.Column("still_url", sa.String(2000), nullable=True))


def downgrade() -> None:
    op.drop_column("episodes", "still_url")
