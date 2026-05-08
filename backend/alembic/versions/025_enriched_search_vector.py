"""Add genres, keywords, and people to media_items search_vector with cascading triggers."""

from alembic import op

revision: str = "025"
down_revision: str | None = "024"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Drop old trigger (function kept for clean downgrade)
    op.execute("DROP TRIGGER IF EXISTS trg_search_vector ON media_items")

    # Build tsvector with weighted fields.
    # A (1.0) = title, B (0.4) = cast/director, C (0.2) = overview, D (0.1) = genres/keywords
    op.execute("""
        CREATE OR REPLACE FUNCTION build_media_search_vector(p_media_item_id TEXT)
        RETURNS tsvector AS $$
        DECLARE
            v_vector tsvector;
        BEGIN
            SELECT
                setweight(to_tsvector('english', COALESCE(mi.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT string_agg(p.name, ' ')
                     FROM media_credits mc
                     JOIN people p ON p.id = mc.person_id
                     WHERE mc.media_item_id = mi.id),
                    ''
                )), 'B') ||
                setweight(to_tsvector('english', COALESCE(mi.overview, '')), 'C') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT string_agg(g.name, ' ')
                     FROM media_genres mg
                     JOIN genres g ON g.id = mg.genre_id
                     WHERE mg.media_item_id = mi.id),
                    ''
                )), 'D') ||
                setweight(to_tsvector('english', COALESCE(
                    (SELECT string_agg(k.name, ' ')
                     FROM media_keywords mk
                     JOIN keywords k ON k.id = mk.keyword_id
                     WHERE mk.media_item_id = mi.id),
                    ''
                )), 'D')
            INTO v_vector
            FROM media_items mi
            WHERE mi.id = p_media_item_id;

            RETURN v_vector;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Trigger function that calls the builder
    op.execute("""
        CREATE OR REPLACE FUNCTION update_search_vector()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vector := build_media_search_vector(NEW.id);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Re-create trigger on media_items — fires for any INSERT/UPDATE so
    # backfill tasks that touch rows (e.g. setting synced_at) also refresh.
    op.execute("""
        CREATE TRIGGER trg_search_vector
            BEFORE INSERT OR UPDATE ON media_items
            FOR EACH ROW EXECUTE FUNCTION update_search_vector();
    """)

    # Cascading refresh: when related tables change, rebuild the parent search_vector
    op.execute("""
        CREATE OR REPLACE FUNCTION refresh_parent_search_vector()
        RETURNS TRIGGER AS $$
        DECLARE
            target_id TEXT;
        BEGIN
            target_id := COALESCE(NEW.media_item_id, OLD.media_item_id);
            UPDATE media_items
            SET search_vector = build_media_search_vector(target_id)
            WHERE id = target_id;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_media_genres_search
            AFTER INSERT OR UPDATE OR DELETE ON media_genres
            FOR EACH ROW EXECUTE FUNCTION refresh_parent_search_vector();
    """)

    op.execute("""
        CREATE TRIGGER trg_media_keywords_search
            AFTER INSERT OR UPDATE OR DELETE ON media_keywords
            FOR EACH ROW EXECUTE FUNCTION refresh_parent_search_vector();
    """)

    op.execute("""
        CREATE TRIGGER trg_media_credits_search
            AFTER INSERT OR UPDATE OR DELETE ON media_credits
            FOR EACH ROW EXECUTE FUNCTION refresh_parent_search_vector();
    """)

    # Re-index all existing rows
    op.execute("UPDATE media_items SET search_vector = build_media_search_vector(id)")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_media_credits_search ON media_credits")
    op.execute("DROP TRIGGER IF EXISTS trg_media_keywords_search ON media_keywords")
    op.execute("DROP TRIGGER IF EXISTS trg_media_genres_search ON media_genres")
    op.execute("DROP TRIGGER IF EXISTS trg_search_vector ON media_items")
    op.execute("DROP FUNCTION IF EXISTS refresh_parent_search_vector")
    op.execute("DROP FUNCTION IF EXISTS update_search_vector")
    op.execute("DROP FUNCTION IF EXISTS build_media_search_vector")

    # Restore original simple trigger
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
