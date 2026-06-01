"""add proposal original_values and voting

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-05-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6g7h8i9j0k1'
down_revision: str | None = 'e5f6g7h8i9j0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'media_edit_proposals',
        sa.Column('original_values', sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        'media_edit_proposals',
        sa.Column('upvote_count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'media_edit_proposals',
        sa.Column('downvote_count', sa.Integer(), nullable=False, server_default='0'),
    )

    op.create_table(
        'proposal_votes',
        sa.Column('user_id', sa.String(16), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('proposal_id', sa.String(16), sa.ForeignKey('media_edit_proposals.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('vote_type', sa.String(4), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_check_constraint(
        'ck_proposal_vote_type', 'proposal_votes',
        "vote_type IN ('up', 'down')",
    )


def downgrade() -> None:
    op.drop_table('proposal_votes')
    op.drop_column('media_edit_proposals', 'downvote_count')
    op.drop_column('media_edit_proposals', 'upvote_count')
    op.drop_column('media_edit_proposals', 'original_values')
