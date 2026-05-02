"""Create Company and InvolvedCompany models, migrate Steam developer/publisher data.

Revision ID: 010
Revises: 009
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Create tables ───────────────────────────────────────────────
    op.create_table(
        "companies",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("slug", sa.String(500), nullable=False, unique=True),
        sa.Column("igdb_id", sa.Integer, unique=True),
    )

    op.create_table(
        "involved_companies",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column(
            "media_item_id",
            sa.String(16),
            sa.ForeignKey("media_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "company_id",
            sa.String(16),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("developer", sa.Boolean, server_default="false", nullable=False),
        sa.Column("publisher", sa.Boolean, server_default="false", nullable=False),
        sa.Column("porting", sa.Boolean, server_default="false", nullable=False),
        sa.Column("supporting", sa.Boolean, server_default="false", nullable=False),
    )

    # ── Migrate existing data ──────────────────────────────────────
    # Insert companies from steam_developers (using DISTINCT to deduplicate by name)
    op.execute("""
        INSERT INTO companies (id, name, slug)
        SELECT DISTINCT ON (lower(dev))
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            dev,
            regexp_replace(
                regexp_replace(lower(trim(dev)), '[^a-z0-9]+', '-', 'g'),
                '^-+|-+$', '', 'g'
            )
        FROM games,
        LATERAL jsonb_array_elements_text(steam_developers) AS dev
        WHERE steam_developers IS NOT NULL
          AND jsonb_array_length(steam_developers) > 0
    """)

    # Insert companies from steam_publishers (skip names already inserted)
    op.execute("""
        INSERT INTO companies (id, name, slug)
        SELECT DISTINCT ON (lower(pub))
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            pub,
            regexp_replace(
                regexp_replace(lower(trim(pub)), '[^a-z0-9]+', '-', 'g'),
                '^-+|-+$', '', 'g'
            )
        FROM games,
        LATERAL jsonb_array_elements_text(steam_publishers) AS pub
        WHERE steam_publishers IS NOT NULL
          AND jsonb_array_length(steam_publishers) > 0
          AND lower(pub) NOT IN (SELECT lower(name) FROM companies)
    """)

    # Create involved_company links for developers
    op.execute("""
        INSERT INTO involved_companies (id, media_item_id, company_id, developer, publisher)
        SELECT
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            g.media_item_id,
            c.id,
            true,
            false
        FROM games g,
        LATERAL jsonb_array_elements_text(g.steam_developers) AS dev_name
        JOIN companies c ON lower(c.name) = lower(dev_name)
        WHERE g.steam_developers IS NOT NULL
          AND jsonb_array_length(g.steam_developers) > 0
    """)

    # Create involved_company links for publishers
    op.execute("""
        INSERT INTO involved_companies (id, media_item_id, company_id, developer, publisher)
        SELECT
            'oti_' || encode(gen_random_bytes(6), 'hex'),
            g.media_item_id,
            c.id,
            false,
            true
        FROM games g,
        LATERAL jsonb_array_elements_text(g.steam_publishers) AS pub_name
        JOIN companies c ON lower(c.name) = lower(pub_name)
        WHERE g.steam_publishers IS NOT NULL
          AND jsonb_array_length(g.steam_publishers) > 0
    """)

    # Merge duplicates: same (media_item_id, company_id) appears as both dev and publisher.
    # Step 1: Aggregate flags into the first row of each duplicate group.
    op.execute("""
        WITH merged AS (
            SELECT media_item_id, company_id,
                   bool_or(developer) AS dev_flag,
                   bool_or(publisher) AS pub_flag
            FROM involved_companies
            GROUP BY media_item_id, company_id
            HAVING COUNT(*) > 1
        )
        UPDATE involved_companies ic
        SET developer = m.dev_flag, publisher = m.pub_flag
        FROM merged m
        WHERE ic.media_item_id = m.media_item_id
          AND ic.company_id = m.company_id
    """)

    # Step 2: Delete duplicate rows, keeping the one with the lowest id.
    op.execute("""
        DELETE FROM involved_companies ic
        WHERE EXISTS (
            SELECT 1 FROM involved_companies ic2
            WHERE ic2.media_item_id = ic.media_item_id
              AND ic2.company_id = ic.company_id
              AND ic2.id < ic.id
        )
    """)

    # Add unique constraint to prevent future duplicates
    op.create_unique_constraint(
        "uq_involved_company_pair",
        "involved_companies",
        ["media_item_id", "company_id"],
    )

    # ── Drop old columns ───────────────────────────────────────────
    op.drop_column("games", "steam_developers")
    op.drop_column("games", "steam_publishers")


def downgrade() -> None:
    # Re-add old columns
    op.execute(
        "ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_developers JSONB"
    )
    op.execute(
        "ALTER TABLE games ADD COLUMN IF NOT EXISTS steam_publishers JSONB"
    )

    # Restore data from involved_companies
    op.execute("""
        UPDATE games g
        SET steam_developers = sub.dev_list
        FROM (
            SELECT ic.media_item_id,
                   COALESCE(jsonb_agg(DISTINCT c.name) FILTER (WHERE ic.developer), '[]'::jsonb) AS dev_list
            FROM involved_companies ic
            JOIN companies c ON c.id = ic.company_id
            GROUP BY ic.media_item_id
        ) sub
        WHERE g.media_item_id = sub.media_item_id
    """)

    op.execute("""
        UPDATE games g
        SET steam_publishers = sub.pub_list
        FROM (
            SELECT ic.media_item_id,
                   COALESCE(jsonb_agg(DISTINCT c.name) FILTER (WHERE ic.publisher), '[]'::jsonb) AS pub_list
            FROM involved_companies ic
            JOIN companies c ON c.id = ic.company_id
            GROUP BY ic.media_item_id
        ) sub
        WHERE g.media_item_id = sub.media_item_id
    """)

    # Drop the new constraint and tables
    op.drop_constraint("uq_involved_company_pair", "involved_companies")
    op.drop_table("involved_companies")
    op.drop_table("companies")
