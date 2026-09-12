"""Unified proposal model (legacy ``backend/otix/domain/proposal.py``).

The legacy ``proposals`` table is already single-table inheritance: every
proposal type (match, edit, ...) shares one row, discriminated by
``proposal_type`` and ``target_type`` with type-specific data in the JSON
``payload``. That shape is ported as-is, one concrete :class:`Proposal` model
with a ``proposal_type`` discriminator plus JSON payload — NOT Django MTI —
because the legacy columns are genuinely shared across types and there is no
per-type column split to justify child tables.

``target_type``/``target_id`` are kept as strings: the target may be a catalog
entity *or* an external id, so no single-column FK can model it.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

PROPOSAL_STATUS_VALUES = ["pending", "approved", "rejected"]
PROPOSAL_TYPE_VALUES = ["match", "edit"]


class Proposal(TimestampedModel):
    """One row for every proposal type (match, edit, future).

    ``proposal_type`` discriminates the kind; ``target_type``/``target_id``
    name the entity the proposal concerns; type-specific data lives in
    ``payload``; ``snapshot`` records pre-change state for undo support.
    """

    # Discrimination.
    proposal_type = models.CharField(max_length=50, db_index=True)
    target_type = models.CharField(max_length=50, db_index=True)
    target_id = models.CharField(max_length=16)  # otix_id of the target entity

    # User relationships.
    proposer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proposals_proposed",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proposals_reviewed",
    )

    # Status machine.
    status = models.CharField(max_length=20, default="pending", db_index=True)

    # Type-specific payload.
    payload = models.JSONField(default=dict)

    # Review outcome.
    rejection_reason = models.TextField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Undo support.
    snapshot = models.JSONField(null=True, blank=True)

    # Community curation.
    upvote_count = models.IntegerField(default=0)
    downvote_count = models.IntegerField(default=0)

    class Meta(TimestampedModel.Meta):
        db_table = "proposals"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=PROPOSAL_STATUS_VALUES),
                name="ck_proposal_status",
            ),
            models.CheckConstraint(
                condition=models.Q(proposal_type__in=PROPOSAL_TYPE_VALUES),
                name="ck_proposal_type",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.proposal_type}:{self.target_type}:{self.target_id}"
