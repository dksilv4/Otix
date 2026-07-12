"""Add DEFAULT NOW() to all NOT NULL timestamp columns for PostgreSQL 17 compatibility.

SQLAlchemy models use server_default=func.now() which expects the database to
provide a default value. PostgreSQL 17 rejects INSERTs that omit NOT NULL columns
without explicit defaults, whereas PG16 silently accepted them in some contexts.
"""

revision = "aaaaaaaa0005"
down_revision = "aaaaaaaa0004"
branch_labels = None
depends_on = None


def upgrade():
    # Add DEFAULT NOW() to all NOT NULL timestamp columns that lack a default.
    # The DO block is idempotent — it skips columns that already have a default.
    op.execute("""
        DO $$
        DECLARE
            r record;
        BEGIN
            FOR r IN
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND is_nullable = 'NO'
                  AND data_type LIKE 'timestamp%'
                  AND column_default IS NULL
                  AND table_name != 'alembic_version'
            LOOP
                EXECUTE format(
                    'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT NOW()',
                    r.table_name, r.column_name
                );
            END LOOP;
        END $$;
    """)


def downgrade():
    # Downgrade is a no-op — removing column defaults is destructive and unnecessary.
    pass
