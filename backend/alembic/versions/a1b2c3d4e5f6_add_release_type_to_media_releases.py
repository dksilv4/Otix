"""Add release_type column to media_releases.

TMDB release types: premiere (1), theatrical_limited (2), theatrical (3),
digital (4), physical (5), tv (6). Stored as lowercase string.

Revision ID: a1b2c3d4e5f6
Revises: m1n2o3p4q5r6
Create Date: 2026-06-03
"""
from __future__ import annotations

from typing import ClassVar

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "m1n2o3p4q5r6"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "media_releases",
        sa.Column(
            "release_type",
            sa.String(20),
            nullable=True,
            comment="TMDB release type: premiere, theatrical_limited, theatrical, digital, physical, tv",
        ),
    )


def downgrade() -> None:
    op.drop_column("media_releases", "release_type")
