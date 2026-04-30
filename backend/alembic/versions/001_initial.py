"""Initial schema — all core tables, indices, and the search vector trigger.

Revision ID: 001
Revises: None
Create Date: 2026-04-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Extensions ──────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── media_items (base table) ────────────────────────────────
    op.create_table(
        "media_items",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("media_type", sa.String(10), nullable=False),
        sa.Column("title", sa.String(1000), nullable=False),
        sa.Column("overview", sa.Text),
        sa.Column("slug", sa.String(1000), nullable=False, unique=True),
        sa.Column("poster_url", sa.String(2000)),
        sa.Column("backdrop_url", sa.String(2000)),
        sa.Column("release_date", sa.Date),
        sa.Column("popularity", sa.Float, server_default="0"),
        sa.Column("original_language", sa.String(10)),
        sa.Column("completeness_score", sa.Float, server_default="0"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_media_items_type", "media_items", ["media_type"])
    op.create_index("idx_media_items_popularity", "media_items", [sa.text("popularity DESC")])
    op.create_index("idx_media_items_search", "media_items", ["search_vector"], postgresql_using="gin")
    op.create_index("idx_media_items_updated", "media_items", [sa.text("updated_at DESC")])

    # ── movies ──────────────────────────────────────────────────
    op.create_table(
        "movies",
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("runtime", sa.Integer),
        sa.Column("budget", sa.BigInteger),
        sa.Column("revenue", sa.BigInteger),
        sa.Column("tagline", sa.String(1000)),
        sa.Column("is_anime", sa.Boolean, server_default="false"),
        sa.Column("collection_id", sa.String(16), nullable=True),
    )

    # ── shows ───────────────────────────────────────────────────
    op.create_table(
        "shows",
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(50)),
        sa.Column("first_air_date", sa.Date),
        sa.Column("last_air_date", sa.Date),
        sa.Column("number_of_seasons", sa.Integer),
        sa.Column("number_of_episodes", sa.Integer),
    )

    # ── seasons ─────────────────────────────────────────────────
    op.create_table(
        "seasons",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("show_id", sa.String(16), sa.ForeignKey("shows.media_item_id", ondelete="CASCADE"), nullable=False),
        sa.Column("season_number", sa.Integer, nullable=False),
        sa.Column("name", sa.String(1000)),
        sa.Column("overview", sa.Text),
        sa.Column("poster_url", sa.String(2000)),
    )
    op.create_index("uq_seasons_show_number", "seasons", ["show_id", "season_number"], unique=True)

    # ── episodes ────────────────────────────────────────────────
    op.create_table(
        "episodes",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("season_id", sa.String(16), sa.ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("episode_number", sa.Integer, nullable=False),
        sa.Column("name", sa.String(1000)),
        sa.Column("overview", sa.Text),
        sa.Column("runtime", sa.Integer),
        sa.Column("air_date", sa.Date),
    )
    op.create_index("uq_episodes_season_number", "episodes", ["season_id", "episode_number"], unique=True)

    # ── games ───────────────────────────────────────────────────
    op.create_table(
        "games",
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("release_status", sa.String(50)),
        sa.Column("website", sa.String(2000)),
        sa.Column("steam_app_id", sa.Integer, unique=True),
        sa.Column("platforms", postgresql.JSONB),
        sa.Column("modes", postgresql.JSONB),
        sa.Column("is_free", sa.Boolean, server_default="false"),
        sa.Column("has_multiplayer", sa.Boolean, server_default="false"),
    )

    # ── collections ─────────────────────────────────────────────
    op.create_table(
        "collections",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("tmdb_id", sa.Integer, unique=True),
        sa.Column("name", sa.String(1000), nullable=False),
        sa.Column("overview", sa.Text),
        sa.Column("poster_url", sa.String(2000)),
        sa.Column("backdrop_url", sa.String(2000)),
    )
    # FK from movies.collection_id → collections
    op.create_foreign_key(
        "fk_movies_collection_id", "movies", "collections", ["collection_id"], ["id"], ondelete="SET NULL"
    )

    op.create_table(
        "collection_items",
        sa.Column("collection_id", sa.String(16), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )

    # ── genres / keywords ───────────────────────────────────────
    op.create_table(
        "genres",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("slug", sa.String(200), nullable=False, unique=True),
    )
    op.create_table(
        "media_genres",
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("genre_id", sa.String(16), sa.ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "keywords",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
    )
    op.create_table(
        "media_keywords",
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("keyword_id", sa.String(16), sa.ForeignKey("keywords.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── people / credits ────────────────────────────────────────
    op.create_table(
        "people",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("tmdb_id", sa.Integer, unique=True),
        sa.Column("imdb_id", sa.String(20), unique=True),
        sa.Column("photo_url", sa.String(2000)),
    )
    op.create_table(
        "media_credits",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", sa.String(16), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("character_name", sa.String(500)),
        sa.Column("sort_order", sa.Integer, server_default="0"),
    )
    op.create_index("uq_media_credit", "media_credits", ["media_item_id", "person_id", "role"], unique=True)

    # ── users ───────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("username", sa.String(150), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("is_verified", sa.Boolean, server_default="false"),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("global_logout_marker", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jti", sa.String(36), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_refresh_tokens_user", "refresh_tokens", ["user_id"])

    # ── user_media_interactions ─────────────────────────────────
    op.create_table(
        "user_media_interactions",
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("interaction_type", sa.String(20), primary_key=True),
        sa.Column("metadata", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── media assets / videos / releases / ratings ──────────────
    op.create_table(
        "media_assets",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_type", sa.String(20), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("width", sa.Integer),
        sa.Column("height", sa.Integer),
        sa.Column("provider", sa.String(20)),
    )
    op.create_index("idx_media_assets_item", "media_assets", ["media_item_id"])

    op.create_table(
        "media_videos",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("video_type", sa.String(50)),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("provider", sa.String(20)),
        sa.Column("provider_id", sa.String(100)),
    )

    op.create_table(
        "media_releases",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("release_date", sa.Date),
        sa.Column("certification", sa.String(20)),
    )

    op.create_table(
        "external_ratings",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("max_score", sa.Float, server_default="10"),
        sa.Column("vote_count", sa.Integer),
    )
    op.create_index("uq_external_rating", "external_ratings", ["media_item_id", "provider"], unique=True)

    # ── external_ids ────────────────────────────────────────────
    op.create_table(
        "external_ids",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("media_item_id", sa.String(16), sa.ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_external_ids_media", "external_ids", ["media_item_id"])
    op.create_index("idx_external_ids_lookup", "external_ids", ["provider", "external_id"], unique=True)

    # ── sync ────────────────────────────────────────────────────
    op.create_table(
        "sync_jobs",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("priority", sa.Integer, server_default="5"),
        sa.Column("phase", sa.String(20), nullable=False, server_default="core"),
        sa.Column("parent_id", sa.String(16), sa.ForeignKey("sync_jobs.id")),
        sa.Column("error_message", sa.Text),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_sync_jobs_status", "sync_jobs", ["status", "priority"])
    op.create_index("idx_sync_jobs_provider", "sync_jobs", ["provider", "external_id"])
    op.create_index("idx_sync_jobs_parent", "sync_jobs", ["parent_id"])

    op.create_table(
        "provider_state",
        sa.Column("provider", sa.String(20), primary_key=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("cursor_value", sa.String(500)),
        sa.Column("rate_limit_remaining", sa.Integer),
        sa.Column("rate_limit_reset", sa.DateTime(timezone=True)),
    )

    # ── search vector trigger ───────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.overview, '')), 'B');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_search_vector
            BEFORE INSERT OR UPDATE OF title, overview ON media_items
            FOR EACH ROW EXECUTE FUNCTION update_search_vector();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_search_vector ON media_items")
    op.execute("DROP FUNCTION IF EXISTS update_search_vector")
    op.drop_table("provider_state")
    op.drop_table("sync_jobs")
    op.drop_table("external_ids")
    op.drop_table("external_ratings")
    op.drop_table("media_releases")
    op.drop_table("media_videos")
    op.drop_table("media_assets")
    op.drop_table("user_media_interactions")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("media_credits")
    op.drop_table("people")
    op.drop_table("media_keywords")
    op.drop_table("keywords")
    op.drop_table("media_genres")
    op.drop_table("genres")
    op.drop_table("collection_items")
    op.drop_table("collections")
    op.drop_table("games")
    op.drop_table("episodes")
    op.drop_table("seasons")
    op.drop_table("shows")
    op.drop_table("movies")
    op.drop_table("media_items")
