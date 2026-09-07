"""Add genre_media_types join table.

Tracks which media types a genre applies to. TMDB uses separate genre lists
(and ID spaces) for movies vs TV, so support is recorded per media type at
link time rather than assumed global.

Idempotent: CREATE uses IF NOT EXISTS.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-01
"""
from __future__ import annotations

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS genre_media_types (
            genre_id VARCHAR(16) NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
            media_type VARCHAR(10) NOT NULL,
            PRIMARY KEY (genre_id, media_type),
            CONSTRAINT ck_genre_media_type CHECK (media_type IN ('movie', 'show', 'game', 'music'))
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS genre_media_types")
