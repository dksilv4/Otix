"""merge_032_and_034

Revision ID: 14c15e62dbef
Revises: 032, 034
Create Date: 2026-05-09 16:33:26.120557
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '14c15e62dbef'
down_revision: str | None = ('032', '034')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
