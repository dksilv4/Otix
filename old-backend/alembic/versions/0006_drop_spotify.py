"""Drop Spotify columns, index, and the orphaned subscriptions table.

The Spotify integration was removed from the codebase (account OAuth,
server-to-server media provider, and all pipeline references). This migration
cleans the schema left behind:

- ``users``:  spotify_id, spotify_username, spotify_email, spotify_avatar_url,
              spotify_access_token, spotify_refresh_token, spotify_token_expires_at
- ``people``: spotify_follower_count, spotify_popularity, spotify_genres,
              spotify_image_url, spotify_related_crawled_at
- ``albums``: spotify_url, spotify_popularity
- the ``users_spotify_id_key`` unique index (Spotify ID is no longer an
  identity field)
- the orphaned ``spotify_playlist_subscriptions`` table (no ORM model,
  Spotify-only)

All statements are idempotent so the chain also applies cleanly to a fresh DB.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-15
"""
from __future__ import annotations

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users_spotify_id_key may be a standalone index (baseline) or backed by a
    # unique constraint (drifted live DB). Drop the constraint first — that
    # removes its backing index too — then the plain index for the other case.
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_spotify_id_key")
    op.execute("DROP INDEX IF EXISTS users_spotify_id_key")

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_username")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_email")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_avatar_url")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_access_token")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_refresh_token")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS spotify_token_expires_at")

    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS spotify_follower_count")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS spotify_popularity")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS spotify_genres")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS spotify_image_url")
    op.execute("ALTER TABLE people DROP COLUMN IF EXISTS spotify_related_crawled_at")

    op.execute("ALTER TABLE albums DROP COLUMN IF EXISTS spotify_url")
    op.execute("ALTER TABLE albums DROP COLUMN IF EXISTS spotify_popularity")

    op.execute("DROP TABLE IF EXISTS spotify_playlist_subscriptions")


def downgrade() -> None:
    # Spotify is gone from the codebase; recreate the schema shape only so the
    # chain can be rolled back. No code references these columns anymore.
    op.execute(
        """CREATE TABLE IF NOT EXISTS spotify_playlist_subscriptions (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  playlist_id VARCHAR(255) NOT NULL,
  playlist_name VARCHAR(512),
  playlist_owner VARCHAR(255),
  playlist_snapshot VARCHAR(255),
  auto_sync BOOLEAN NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)"""
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_spotify_playlist_sub_user "
        "ON spotify_playlist_subscriptions (user_id)"
    )

    op.execute(
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS spotify_url VARCHAR(500)"
    )
    op.execute(
        "ALTER TABLE albums ADD COLUMN IF NOT EXISTS spotify_popularity INTEGER"
    )

    op.execute(
        "ALTER TABLE people ADD COLUMN IF NOT EXISTS spotify_follower_count INTEGER"
    )
    op.execute(
        "ALTER TABLE people ADD COLUMN IF NOT EXISTS spotify_popularity INTEGER"
    )
    op.execute("ALTER TABLE people ADD COLUMN IF NOT EXISTS spotify_genres JSONB")
    op.execute(
        "ALTER TABLE people ADD COLUMN IF NOT EXISTS spotify_image_url VARCHAR(2000)"
    )
    op.execute(
        "ALTER TABLE people ADD COLUMN IF NOT EXISTS spotify_related_crawled_at TIMESTAMPTZ"
    )

    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_id VARCHAR(64)")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_username VARCHAR(150)"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_email VARCHAR(320)")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_avatar_url VARCHAR(2048)"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_access_token TEXT")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS spotify_token_expires_at TIMESTAMPTZ"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_spotify_id_key ON users (spotify_id)"
    )
