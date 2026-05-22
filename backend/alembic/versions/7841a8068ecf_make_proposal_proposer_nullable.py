"""Make media_edit_proposals.proposer_user_id nullable for system proposals."""

revision = "7841a8068ecf"
down_revision = "6841a8068fcf"

from typing import Sequence, Union

from alembic import op


def upgrade() -> None:
    op.alter_column(
        "media_edit_proposals",
        "proposer_user_id",
        existing_nullable=False,
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "media_edit_proposals",
        "proposer_user_id",
        existing_nullable=True,
        nullable=False,
    )
