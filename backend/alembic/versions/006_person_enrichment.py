"""Add biography/birthday/deathday/place_of_birth to people and create person_assets.

Revision ID: 006
Revises: 005
Create Date: 2026-05-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("people", sa.Column("biography", sa.Text(), nullable=True))
    op.add_column("people", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column("people", sa.Column("deathday", sa.Date(), nullable=True))
    op.add_column("people", sa.Column("place_of_birth", sa.String(500), nullable=True))

    op.create_table(
        "person_assets",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("person_id", sa.String(16), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False, unique=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("person_assets")
    op.drop_column("people", "place_of_birth")
    op.drop_column("people", "deathday")
    op.drop_column("people", "birthday")
    op.drop_column("people", "biography")
