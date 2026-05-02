"""Normalize platforms and game modes into lookup tables.

Creates platforms, media_platforms, game_modes, media_game_modes tables.
Migrates existing JSONB data from games.platforms and games.modes.
Drops the old JSONB columns.

Revision ID: 012
Revises: 011
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Create tables ───────────────────────────────────────────────
    op.create_table(
        "platforms",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("igdb_id", sa.Integer, unique=True),
        sa.Column("logo_image_id", sa.String(100)),
    )

    op.create_table(
        "media_platforms",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column(
            "media_item_id",
            sa.String(16),
            sa.ForeignKey("media_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "platform_id",
            sa.String(16),
            sa.ForeignKey("platforms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("media_item_id", "platform_id", name="uq_media_platform"),
    )

    op.create_table(
        "game_modes",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
    )

    op.create_table(
        "media_game_modes",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column(
            "media_item_id",
            sa.String(16),
            sa.ForeignKey("media_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "game_mode_id",
            sa.String(16),
            sa.ForeignKey("game_modes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("media_item_id", "game_mode_id", name="uq_media_game_mode"),
    )

    # ── Migrate platforms ───────────────────────────────────────────
    # Insert unique platforms from games.platforms JSONB
    op.execute("""
        INSERT INTO platforms (id, name, slug, logo_image_id)
        SELECT DISTINCT ON (lower(p.value->>'name'))
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            p.value->>'name',
            regexp_replace(
                regexp_replace(lower(trim(p.value->>'name')), '[^a-z0-9]+', '-', 'g'),
                '^-+|-+$', '', 'g'
            ),
            p.value->>'logo_image_id'
        FROM games g,
        LATERAL jsonb_each(g.platforms) AS p
        WHERE g.platforms IS NOT NULL
          AND jsonb_typeof(g.platforms) = 'object'
    """)

    # Create media_platform links
    op.execute("""
        INSERT INTO media_platforms (id, media_item_id, platform_id)
        SELECT
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            g.media_item_id,
            pl.id
        FROM games g,
        LATERAL jsonb_each(g.platforms) AS p
        JOIN platforms pl ON lower(pl.name) = lower(p.value->>'name')
        WHERE g.platforms IS NOT NULL
          AND jsonb_typeof(g.platforms) = 'object'
    """)

    # ── Migrate game modes ──────────────────────────────────────────
    # Insert unique game modes from games.modes JSONB
    op.execute("""
        INSERT INTO game_modes (id, name, slug)
        SELECT DISTINCT ON (lower(m.value->>'name'))
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            m.value->>'name',
            regexp_replace(
                regexp_replace(lower(trim(m.value->>'name')), '[^a-z0-9]+', '-', 'g'),
                '^-+|-+$', '', 'g'
            )
        FROM games g,
        LATERAL jsonb_each(g.modes) AS m
        WHERE g.modes IS NOT NULL
          AND jsonb_typeof(g.modes) = 'object'
    """)

    # Create media_game_mode links
    op.execute("""
        INSERT INTO media_game_modes (id, media_item_id, game_mode_id)
        SELECT
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            g.media_item_id,
            gm.id
        FROM games g,
        LATERAL jsonb_each(g.modes) AS m
        JOIN game_modes gm ON lower(gm.name) = lower(m.value->>'name')
        WHERE g.modes IS NOT NULL
          AND jsonb_typeof(g.modes) = 'object'
    """)

    # ── Drop old columns ───────────────────────────────────────────
    op.drop_column("games", "platforms")
    op.drop_column("games", "modes")


def downgrade() -> None:
    # Re-add old columns
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS platforms JSONB")
    op.execute("ALTER TABLE games ADD COLUMN IF NOT EXISTS modes JSONB")

    # Restore platforms data from media_platforms
    op.execute("""
        UPDATE games g
        SET platforms = sub.plat_data
        FROM (
            SELECT mp.media_item_id,
                   COALESCE(jsonb_object_agg(p.slug, jsonb_build_object('name', p.name)), '{}'::jsonb) AS plat_data
            FROM media_platforms mp
            JOIN platforms p ON p.id = mp.platform_id
            GROUP BY mp.media_item_id
        ) sub
        WHERE g.media_item_id = sub.media_item_id
    """)

    # Restore modes data from media_game_modes
    op.execute("""
        UPDATE games g
        SET modes = sub.mode_data
        FROM (
            SELECT mgm.media_item_id,
                   COALESCE(jsonb_object_agg(gm.slug, jsonb_build_object('name', gm.name)), '{}'::jsonb) AS mode_data
            FROM media_game_modes mgm
            JOIN game_modes gm ON gm.id = mgm.game_mode_id
            GROUP BY mgm.media_item_id
        ) sub
        WHERE g.media_item_id = sub.media_item_id
    """)

    # Drop new tables
    op.drop_table("media_game_modes")
    op.drop_table("game_modes")
    op.drop_table("media_platforms")
    op.drop_table("platforms")
