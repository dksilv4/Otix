"""create unified proposals table — merge match_proposals + media_edit_proposals

Revision ID: p1q2r3s4t5u6
Revises: 5f930e0f17cc, 3d46508f1384
Create Date: 2026-06-22

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "p1q2r3s4t5u6"
down_revision: str | None | tuple[str, ...] = ("5f930e0f17cc", "3d46508f1384")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1. Create unified proposals table ──────────────────────────
    op.create_table(
        "proposals",
        sa.Column("id", sa.String(16), primary_key=True, nullable=False),
        sa.Column("proposal_type", sa.String(50), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", sa.String(16), nullable=False),
        sa.Column("proposer_id", sa.String(16), nullable=True),
        sa.Column("reviewer_id", sa.String(16), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("upvote_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("downvote_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["proposer_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_proposal_status"),
        sa.CheckConstraint("proposal_type IN ('match', 'edit')", name="ck_proposal_type"),
    )
    op.create_index("ix_proposals_type_status", "proposals", ["proposal_type", "status"])
    op.create_index("ix_proposals_target", "proposals", ["target_type", "target_id"])

    # ── 2. Migrate match_proposals → proposals (type='match') ──────
    op.execute("""
        INSERT INTO proposals (
            id, proposal_type, target_type, target_id,
            proposer_id, reviewer_id, status, payload,
            rejection_reason, reviewed_at, upvote_count, downvote_count,
            snapshot, created_at, updated_at
        )
        SELECT
            id, 'match', 'media_item', otix_media_id,
            NULL, reviewed_by, status,
            jsonb_build_object(
                'source', source,
                'source_game_id', source_game_id,
                'source_title', source_title,
                'developer', developer,
                'release_year', release_year,
                'poster_url', poster_url,
                'otix_media_id', otix_media_id,
                'otix_title', otix_title,
                'otix_confidence', otix_confidence,
                'match_type', match_type
            ),
            NULL, reviewed_at, 0, 0,
            jsonb_build_object(
                'source', source,
                'source_game_id', source_game_id
            ),
            created_at, updated_at
        FROM match_proposals
        ON CONFLICT (id) DO NOTHING
    """)

    # ── 3. Migrate media_edit_proposals → proposals (type='edit') ──
    op.execute("""
        INSERT INTO proposals (
            id, proposal_type, target_type, target_id,
            proposer_id, reviewer_id, status, payload,
            rejection_reason, reviewed_at, upvote_count, downvote_count,
            snapshot, created_at, updated_at
        )
        SELECT
            id, 'edit', 'media_item', media_item_id,
            proposer_user_id, approver_user_id, status,
            jsonb_build_object(
                'changes', changes,
                'image_overrides', image_overrides
            ),
            rejection_reason, NULL, upvote_count, downvote_count,
            original_values, created_at, updated_at
        FROM media_edit_proposals
        ON CONFLICT (id) DO NOTHING
    """)

    # ── 4. Update proposal_votes FK constraint ─────────────────────
    # Drop old FK to media_edit_proposals, add FK to proposals
    op.drop_constraint("proposal_votes_proposal_id_fkey", "proposal_votes", type_="foreignkey")
    op.create_foreign_key(
        "proposal_votes_proposal_id_fkey", "proposal_votes", "proposals",
        ["proposal_id"], ["id"], ondelete="CASCADE",
    )

    # ── 5. Add snapshot column to old tables for undo support ──────
    # (media_edit_proposals already has original_values; match_proposals doesn't need it)


def downgrade() -> None:
    # Restore FK to media_edit_proposals
    op.drop_constraint("proposal_votes_proposal_id_fkey", "proposal_votes", type_="foreignkey")
    op.create_foreign_key(
        "proposal_votes_proposal_id_fkey", "proposal_votes", "media_edit_proposals",
        ["proposal_id"], ["id"], ondelete="CASCADE",
    )

    # Drop unified table
    op.drop_index("ix_proposals_target", table_name="proposals")
    op.drop_index("ix_proposals_type_status", table_name="proposals")
    op.drop_table("proposals")
