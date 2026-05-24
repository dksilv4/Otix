"""add_workout_streak_columns

Revision ID: 6c9a83fc54f3
Revises: b1c2d3e4f5a6
Create Date: 2026-05-24 17:27:07.259454
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '6c9a83fc54f3'
down_revision: str | None = 'b1c2d3e4f5a6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('user_streaks', sa.Column('current_workout_streak', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('user_streaks', sa.Column('longest_workout_streak', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('user_streaks', sa.Column('last_workout_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_streaks', 'last_workout_date')
    op.drop_column('user_streaks', 'longest_workout_streak')
    op.drop_column('user_streaks', 'current_workout_streak')
