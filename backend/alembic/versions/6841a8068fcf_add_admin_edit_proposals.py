"""add admin edit proposals

Revision ID: 6841a8068fcf
Revises: 5841a8068ecf
Create Date: 2026-05-22 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '6841a8068fcf'
down_revision: str | None = '5841a8068ecf'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('media_edit_proposals',
        sa.Column('id', sa.String(length=16), nullable=False),
        sa.Column('media_item_id', sa.String(length=16), nullable=False),
        sa.Column('proposer_user_id', sa.String(length=16), nullable=False),
        sa.Column('approver_user_id', sa.String(length=16), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('changes', postgresql.JSONB(), nullable=False),
        sa.Column('image_overrides', postgresql.JSONB(), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name='ck_edit_proposal_status'),
        sa.ForeignKeyConstraint(['media_item_id'], ['media_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['proposer_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['approver_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_edit_proposals_media', 'media_edit_proposals', ['media_item_id'], unique=False)
    op.create_index('ix_edit_proposals_status', 'media_edit_proposals', ['status'], unique=False)

    op.create_table('media_image_overrides',
        sa.Column('id', sa.String(length=16), nullable=False),
        sa.Column('media_item_id', sa.String(length=16), nullable=False),
        sa.Column('image_type', sa.String(length=20), nullable=False),
        sa.Column('language_code', sa.String(length=10), nullable=False),
        sa.Column('url', sa.String(length=2000), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by_user_id', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            "image_type IN ('poster', 'backdrop', 'logo', 'textless_poster')",
            name='ck_image_override_type'
        ),
        sa.ForeignKeyConstraint(['media_item_id'], ['media_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_image_overrides_media', 'media_image_overrides', ['media_item_id'], unique=False)
    op.create_index('ix_image_overrides_media_type_lang', 'media_image_overrides', ['media_item_id', 'image_type', 'language_code'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_image_overrides_media_type_lang', table_name='media_image_overrides')
    op.drop_index('ix_image_overrides_media', table_name='media_image_overrides')
    op.drop_table('media_image_overrides')
    op.drop_index('ix_edit_proposals_status', table_name='media_edit_proposals')
    op.drop_index('ix_edit_proposals_media', table_name='media_edit_proposals')
    op.drop_table('media_edit_proposals')
