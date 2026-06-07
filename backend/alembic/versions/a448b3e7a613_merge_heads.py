"""merge heads

Revision ID: a448b3e7a613
Revises: n1o2p3q4r5s6, a1b2c3d4e5f6
Create Date: 2026-06-04 10:31:08.090246
"""

from collections.abc import Sequence

revision: str = 'a448b3e7a613'
down_revision: str | None = ('n1o2p3q4r5s6', 'a1b2c3d4e5f6')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
