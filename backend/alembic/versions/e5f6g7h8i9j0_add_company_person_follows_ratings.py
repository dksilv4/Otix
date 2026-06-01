"""add company/person follows and ratings

Revision ID: e5f6g7h8i9j0
Revises: d847197dadc8
Create Date: 2026-05-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6g7h8i9j0'
down_revision: str | None = 'd847197dadc8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'user_company_follows',
        sa.Column('user_id', sa.String(16), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('company_id', sa.String(16), sa.ForeignKey('companies.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'company_ratings',
        sa.Column('user_id', sa.String(16), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('company_id', sa.String(16), sa.ForeignKey('companies.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.CheckConstraint('score >= 1 AND score <= 5', name='ck_company_rating_score_range'),
    )

    op.create_table(
        'person_ratings',
        sa.Column('user_id', sa.String(16), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('person_id', sa.String(16), sa.ForeignKey('people.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.CheckConstraint('score >= 1 AND score <= 5', name='ck_person_rating_score_range'),
    )

    # Performance indexes for company-based media filtering
    op.create_index('ix_involved_companies_company_id', 'involved_companies', ['company_id'])
    op.create_index('ix_involved_companies_media_item_id', 'involved_companies', ['media_item_id'])


def downgrade() -> None:
    op.drop_table('person_ratings')
    op.drop_table('company_ratings')
    op.drop_table('user_company_follows')
