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

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS person_assets (
            id VARCHAR(16) NOT NULL,
            person_id VARCHAR(16) NOT NULL,
            url VARCHAR(2000) NOT NULL,
            width INTEGER,
            height INTEGER,
            provider VARCHAR(20),
            PRIMARY KEY (id),
            FOREIGN KEY(person_id) REFERENCES people (id) ON DELETE CASCADE,
            UNIQUE (url)
        )
        """
    )


def downgrade() -> None:
    op.drop_table("person_assets")
    op.drop_column("people", "place_of_birth")
    op.drop_column("people", "deathday")
    op.drop_column("people", "birthday")
    op.drop_column("people", "biography")
