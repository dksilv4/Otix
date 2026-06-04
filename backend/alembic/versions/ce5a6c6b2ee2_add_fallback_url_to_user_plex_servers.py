"""add fallback_url to user_plex_servers

Revision ID: ce5a6c6b2ee2
Revises: a448b3e7a613
Create Date: 2026-06-04 10:31:13.600826
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'ce5a6c6b2ee2'
down_revision: str | None = 'a448b3e7a613'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('user_plex_servers')]
    if 'fallback_url' not in columns:
        op.add_column('user_plex_servers', sa.Column('fallback_url', sa.String(length=2048), nullable=True))



def downgrade() -> None:
    op.drop_column('user_plex_servers', 'fallback_url')
