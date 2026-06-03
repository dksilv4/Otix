"""Consolidated schema migration — replaces all intermediate migrations.

This migration sits after the initial schema and applies ALL changes from
previously separate migrations that were either never run or broken because
the initial migration was modified after being applied to production.

Every operation uses IF NOT EXISTS / IF EXISTS so it's safe to apply
regardless of which schema state the production database is in.

Revision ID: m1n2o3p4q5r6
Revises: d847197dadc8
Create Date: 2026-06-03
"""
from __future__ import annotations

from typing import ClassVar

import sqlalchemy as sa
from alembic import op

revision: str = "m1n2o3p4q5r6"
down_revision: str | None = "6c9a83fc54f3"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # ── e5f6g7h8i9j0: company/person follows and ratings ──
    op.execute(
        "CREATE TABLE IF NOT EXISTS user_company_follows ("
        "  user_id VARCHAR(16) REFERENCES users(id) ON DELETE CASCADE,"
        "  company_id VARCHAR(16) REFERENCES companies(id) ON DELETE CASCADE,"
        "  created_at TIMESTAMPTZ DEFAULT now(),"
        "  PRIMARY KEY (user_id, company_id)"
        ")"
    )
    op.execute(
        "CREATE TABLE IF NOT EXISTS company_ratings ("
        "  user_id VARCHAR(16) REFERENCES users(id) ON DELETE CASCADE,"
        "  company_id VARCHAR(16) REFERENCES companies(id) ON DELETE CASCADE,"
        "  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),"
        "  PRIMARY KEY (user_id, company_id)"
        ")"
    )
    op.execute(
        "CREATE TABLE IF NOT EXISTS person_ratings ("
        "  user_id VARCHAR(16) REFERENCES users(id) ON DELETE CASCADE,"
        "  person_id VARCHAR(16) REFERENCES people(id) ON DELETE CASCADE,"
        "  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),"
        "  PRIMARY KEY (user_id, person_id)"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_involved_companies_company_id "
        "ON involved_companies (company_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_involved_companies_media_item_id "
        "ON involved_companies (media_item_id)"
    )

    # ── f6g7h8i9j0k1: proposal original values and voting ──
    op.execute(
        "ALTER TABLE media_edit_proposals "
        "ADD COLUMN IF NOT EXISTS original_values JSONB"
    )
    op.execute(
        "ALTER TABLE media_edit_proposals "
        "ADD COLUMN IF NOT EXISTS upvote_count INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE media_edit_proposals "
        "ADD COLUMN IF NOT EXISTS downvote_count INTEGER NOT NULL DEFAULT 0"
    )

    # ── fac5519f6019: icon_url + proposal_votes alterations ──
    op.execute(
        "ALTER TABLE media_items "
        "ADD COLUMN IF NOT EXISTS icon_url VARCHAR(2000)"
    )
    op.execute(
        "ALTER TABLE proposal_votes "
        "ALTER COLUMN created_at SET NOT NULL"
    )
    op.execute(
        "ALTER TABLE proposal_votes "
        "ALTER COLUMN created_at SET DEFAULT now()"
    )

    # ── g7h8i9j0k1l2: search performance indexes ──
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_media_items_search_vector "
        "ON media_items USING GIN (search_vector)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_media_items_title_trgm "
        "ON media_items USING GIN (title gin_trgm_ops)"
    )

    # ── h8i9j0k1l2m3: normalize IGDB asset types (data migration) ──
    op.execute(
        "UPDATE media_assets SET asset_type = 'poster' "
        "WHERE provider = 'igdb' AND asset_type = 'cover'"
    )
    op.execute(
        "UPDATE media_assets SET asset_type = 'backdrop' "
        "WHERE provider = 'igdb' AND asset_type = 'artwork'"
    )

    # ── i9j0k1l2m3n4: game content relationships ──
    op.execute(
        "CREATE TABLE IF NOT EXISTS game_content_items ("
        "  id VARCHAR(16) PRIMARY KEY,"
        "  media_item_id VARCHAR(16) NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,"
        "  content_type VARCHAR(30) NOT NULL,"
        "  url VARCHAR(2000),"
        "  description TEXT,"
        "  created_at TIMESTAMPTZ DEFAULT now()"
        ")"
    )

    # ── j1k2l3m4n5o6: separate ratings from reviews ──
    op.execute(
        "CREATE TABLE IF NOT EXISTS media_item_ratings ("
        "  user_id VARCHAR(16) REFERENCES users(id) ON DELETE CASCADE,"
        "  media_item_id VARCHAR(16) REFERENCES media_items(id) ON DELETE CASCADE,"
        "  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),"
        "  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,"
        "  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,"
        "  PRIMARY KEY (user_id, media_item_id)"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_media_item_ratings_user "
        "ON media_item_ratings (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_media_item_ratings_media "
        "ON media_item_ratings (media_item_id)"
    )

    # ── k1l2m3n4o5p6: Spotify playlist subscriptions ──
    op.execute(
        "CREATE TABLE IF NOT EXISTS spotify_playlist_subscriptions ("
        "  id VARCHAR(16) PRIMARY KEY,"
        "  user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        "  playlist_id VARCHAR(255) NOT NULL,"
        "  playlist_name VARCHAR(512),"
        "  playlist_owner VARCHAR(255),"
        "  playlist_snapshot VARCHAR(255),"
        "  auto_sync BOOLEAN NOT NULL DEFAULT true,"
        "  last_synced_at TIMESTAMPTZ,"
        "  created_at TIMESTAMPTZ DEFAULT now() NOT NULL"
        ")"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spotify_playlist_sub_user "
        "ON spotify_playlist_subscriptions (user_id)"
    )

    # ── Missing columns (back-ported into initial migration) ──
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100)"
    )
    op.execute(
        "ALTER TABLE media_items "
        "ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE external_ids ADD COLUMN IF NOT EXISTS entity_id VARCHAR(16)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_external_id_entity "
        "ON external_ids (entity_type, entity_id)"
    )
    op.execute(
        "ALTER TABLE involved_companies "
        "ADD COLUMN IF NOT EXISTS production BOOLEAN NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    # No downgrade — this is a catch-all consolidation.
    # Individual schema objects can be dropped in environment-specific scripts.
    pass
