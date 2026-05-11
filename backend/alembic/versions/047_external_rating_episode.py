"""Generalize external_ratings to support episodes, drop stale episodes.vote_average"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "047"
down_revision: str | None = "046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Generalize external_ratings — make media_item_id nullable, add episode_id
    op.alter_column("external_ratings", "media_item_id", existing_type=sa.String(16), nullable=True)
    op.add_column("external_ratings", sa.Column("episode_id", sa.String(16), sa.ForeignKey("episodes.id", ondelete="CASCADE"), nullable=True))
    op.create_check_constraint("ck_external_rating_target", "external_ratings", "media_item_id IS NOT NULL OR episode_id IS NOT NULL")

    # Drop the stale vote_average column from old 044 migration (now tracked via ExternalRating)
    op.drop_column("episodes", "vote_average")


def downgrade() -> None:
    op.add_column("episodes", sa.Column("vote_average", sa.Double, nullable=True))
    op.drop_constraint("ck_external_rating_target", "external_ratings")
    op.drop_column("external_ratings", "episode_id")
    op.alter_column("external_ratings", "media_item_id", existing_type=sa.String(16), nullable=False)
