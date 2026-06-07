"""ensure_missing_initial_tables

Revision ID: 5f930e0f17cc
Revises: ce5a6c6b2ee2
Create Date: 2026-06-04 12:06:10.056938
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '5f930e0f17cc'
down_revision: str | None = 'ce5a6c6b2ee2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if 'watch_providers' not in tables:
        op.create_table('watch_providers',
            sa.Column('id', sa.String(length=16), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('slug', sa.String(length=200), nullable=False),
            sa.Column('logo_url', sa.String(length=2000), nullable=True),
            sa.Column('display_priority', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug', name='uq_watch_provider_slug')
        )

    if 'media_watch_providers' not in tables:
        op.create_table('media_watch_providers',
            sa.Column('id', sa.String(length=16), nullable=False),
            sa.Column('media_item_id', sa.String(length=16), nullable=False),
            sa.Column('watch_provider_id', sa.String(length=16), nullable=False),
            sa.Column('country_code', sa.String(length=2), nullable=False),
            sa.Column('offering_type', sa.String(length=20), nullable=False),
            sa.Column('url', sa.String(length=2000), nullable=True),
            sa.Column('display_priority', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['media_item_id'], ['media_items.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['watch_provider_id'], ['watch_providers.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('media_item_id', 'watch_provider_id', 'country_code', 'offering_type', name='uq_media_watch_provider')
        )

    if 'follow_requests' not in tables:
        op.create_table('follow_requests',
            sa.Column('id', sa.String(length=16), nullable=False),
            sa.Column('requester_id', sa.String(length=16), nullable=False),
            sa.Column('target_id', sa.String(length=16), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.CheckConstraint('requester_id != target_id', name='ck_follow_req_no_self'),
            sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['target_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_follow_requests_requester', 'follow_requests', ['requester_id'], unique=False)
        op.create_index('ix_follow_requests_target_status', 'follow_requests', ['target_id', 'status'], unique=False)

    if 'search_logs' not in tables:
        op.create_table('search_logs',
            sa.Column('id', sa.String(length=16), nullable=False),
            sa.Column('query', sa.String(length=500), nullable=False),
            sa.Column('media_type', sa.String(length=10), nullable=True),
            sa.Column('sort_by', sa.String(length=20), nullable=True),
            sa.Column('page', sa.Integer(), nullable=False),
            sa.Column('page_size', sa.Integer(), nullable=False),
            sa.Column('result_count', sa.Integer(), nullable=True),
            sa.Column('items_returned', sa.Integer(), nullable=False),
            sa.Column('tracks_returned', sa.Integer(), nullable=False),
            sa.Column('backfill_triggered', sa.Boolean(), nullable=False),
            sa.Column('cache_hit', sa.Boolean(), nullable=False),
            sa.Column('query_embedding_available', sa.Boolean(), nullable=True),
            sa.Column('user_id', sa.String(length=16), nullable=True),
            sa.Column('is_bot', sa.Boolean(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_search_logs_user_id'), 'search_logs', ['user_id'], unique=False)

    # Check reviews table columns
    reviews_columns = [c['name'] for c in inspector.get_columns('reviews')]
    if 'cooldown_until' not in reviews_columns:
        op.add_column('reviews', sa.Column('cooldown_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    reviews_columns = [c['name'] for c in inspector.get_columns('reviews')]
    if 'cooldown_until' in reviews_columns:
        op.drop_column('reviews', 'cooldown_until')

    if 'search_logs' in tables:
        op.drop_table('search_logs')
    if 'follow_requests' in tables:
        op.drop_table('follow_requests')
    if 'media_watch_providers' in tables:
        op.drop_table('media_watch_providers')
    if 'watch_providers' in tables:
        op.drop_table('watch_providers')

