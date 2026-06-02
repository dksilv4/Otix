"""add game content relationships

Revision ID: i9j0k1l2m3n4
Revises: fac5519f6019
Create Date: 2026-06-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "i9j0k1l2m3n4"
down_revision: str | None = "fac5519f6019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "game_content_items",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("parent_media_item_id", sa.String(length=16), nullable=False),
        sa.Column("media_item_id", sa.String(length=16), nullable=True),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=1000), nullable=False),
        sa.Column("slug", sa.String(length=1000), nullable=False),
        sa.Column("overview", sa.Text(), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=True),
        sa.Column("provider_id", sa.String(length=100), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "content_type IN ('dlc', 'expansion', 'standalone_expansion', 'edition', "
            "'bundle', 'port', 'remake', 'remaster', 'season', 'event', 'update', "
            "'mod', 'soundtrack', 'other')",
            name="ck_game_content_type",
        ),
        sa.CheckConstraint(
            "status IS NULL OR status IN ('announced', 'active', 'ended', 'released', "
            "'delisted', 'cancelled', 'unknown')",
            name="ck_game_content_status",
        ),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_media_item_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "parent_media_item_id",
            "content_type",
            "provider",
            "provider_id",
            name="uq_game_content_provider_item",
        ),
    )
    op.create_index("ix_game_content_media_item", "game_content_items", ["media_item_id"])
    op.create_index("ix_game_content_parent_type", "game_content_items", ["parent_media_item_id", "content_type"])

    op.create_table(
        "game_relationships",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("source_media_item_id", sa.String(length=16), nullable=False),
        sa.Column("target_media_item_id", sa.String(length=16), nullable=False),
        sa.Column("relationship_type", sa.String(length=40), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_relationship_id", sa.String(length=100), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "relationship_type IN ('dlc', 'expansion', 'standalone_expansion', "
            "'bundle_member', 'version', 'port', 'remake', 'remaster', 'fork', "
            "'similar', 'parent')",
            name="ck_game_relationship_type",
        ),
        sa.CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_game_relationship_confidence"),
        sa.ForeignKeyConstraint(["source_media_item_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_media_item_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_media_item_id",
            "target_media_item_id",
            "relationship_type",
            "provider",
            name="uq_game_relationship",
        ),
    )
    op.create_index(
        "ix_game_relationship_source_type",
        "game_relationships",
        ["source_media_item_id", "relationship_type"],
    )
    op.create_index(
        "ix_game_relationship_target_type",
        "game_relationships",
        ["target_media_item_id", "relationship_type"],
    )

    op.create_table(
        "game_releases",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("media_item_id", sa.String(length=16), nullable=False),
        sa.Column("platform_id", sa.String(length=16), nullable=True),
        sa.Column("region_code", sa.String(length=10), nullable=True),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("release_status", sa.String(length=50), nullable=True),
        sa.Column("format", sa.String(length=50), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["platforms.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "media_item_id",
            "platform_id",
            "region_code",
            "provider",
            "external_id",
            name="uq_game_release_provider_item",
        ),
    )
    op.create_index("ix_game_releases_date", "game_releases", ["release_date"])
    op.create_index("ix_game_releases_media_platform", "game_releases", ["media_item_id", "platform_id"])

    op.create_table(
        "game_store_offers",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("media_item_id", sa.String(length=16), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("url", sa.String(length=2000), nullable=True),
        sa.Column("price_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_free", sa.Boolean(), nullable=False),
        sa.Column("is_dlc", sa.Boolean(), nullable=False),
        sa.Column("parent_external_id", sa.String(length=100), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["media_item_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "external_id", name="uq_game_store_offer_provider_ext"),
    )
    op.create_index("ix_game_store_offers_media_provider", "game_store_offers", ["media_item_id", "provider"])
    op.create_index("ix_game_store_offers_parent", "game_store_offers", ["provider", "parent_external_id"])


def downgrade() -> None:
    op.drop_index("ix_game_store_offers_parent", table_name="game_store_offers")
    op.drop_index("ix_game_store_offers_media_provider", table_name="game_store_offers")
    op.drop_table("game_store_offers")

    op.drop_index("ix_game_releases_media_platform", table_name="game_releases")
    op.drop_index("ix_game_releases_date", table_name="game_releases")
    op.drop_table("game_releases")

    op.drop_index("ix_game_relationship_target_type", table_name="game_relationships")
    op.drop_index("ix_game_relationship_source_type", table_name="game_relationships")
    op.drop_table("game_relationships")

    op.drop_index("ix_game_content_parent_type", table_name="game_content_items")
    op.drop_index("ix_game_content_media_item", table_name="game_content_items")
    op.drop_table("game_content_items")
