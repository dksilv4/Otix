"""Review-vote domain logic.

Port of the vote helpers from the legacy ``KarmaService``
(``old-backend/otix/services/karma_service.py``) for the ``/reviews/{user}/{media}/vote``
routes. The greenfield ``ReviewVote`` rows FK a ``Review`` (resolved by its
legacy composite address), unlike the legacy rows that referenced the composite
columns directly; vote toggling semantics are unchanged. Karma ledger writes are
not ported here -- the karma surface is out of this wave's scope.
"""

from django.db.models import Count

from apps.social.models import Review, ReviewVote


def get_review_by_composite(review_user_id: int, media_item_id: int) -> Review | None:
    """Resolve a review by its legacy composite address."""
    return Review.objects.filter(user_id=review_user_id, media_item_id=media_item_id).first()


def get_vote_counts(review_user_id: int, media_item_id: int) -> dict:
    """Return ``{"up": n, "down": n}`` tallies for a review's votes."""
    counts = {"up": 0, "down": 0}
    rows = (
        ReviewVote.objects.filter(
            review__user_id=review_user_id, review__media_item_id=media_item_id
        )
        .values("vote_type")
        .annotate(total=Count("id"))
    )
    for row in rows:
        counts[row["vote_type"]] = row["total"]
    return counts


def get_my_vote(
    voter_id: int, review_user_id: int, media_item_id: int
) -> str | None:
    """Return the voter's current ``up``/``down`` on the review, if any."""
    return (
        ReviewVote.objects.filter(
            voter_id=voter_id,
            review__user_id=review_user_id,
            review__media_item_id=media_item_id,
        )
        .values_list("vote_type", flat=True)
        .first()
    )


def vote_review(voter_id: int, review: Review, vote_type: str) -> None:
    """Upsert a vote: same vote removes it (toggle off), a different one flips."""
    existing = ReviewVote.objects.filter(voter_id=voter_id, review=review).first()
    if existing is None:
        ReviewVote.objects.create(voter_id=voter_id, review=review, vote_type=vote_type)
        return
    if existing.vote_type == vote_type:
        existing.delete()
        return
    existing.vote_type = vote_type
    existing.save(update_fields=["vote_type", "updated_at"])


def remove_vote(voter_id: int, review_user_id: int, media_item_id: int) -> bool:
    """Delete the voter's vote on the review; returns whether a row was removed."""
    deleted, _ = ReviewVote.objects.filter(
        voter_id=voter_id,
        review__user_id=review_user_id,
        review__media_item_id=media_item_id,
    ).delete()
    return deleted > 0
