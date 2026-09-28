"""Company domain logic as plain callables over the models.

Views stay thin; follow/rating mutations and the detail-response assembly live
here so their semantics are testable without HTTP. The service methods mirror
the legacy ``CompanyService`` (``old-backend/otix/services/company_service.py``):
mutations are idempotent and ``get_company_detail`` returns ``None`` for an
unknown id so callers can 404.
"""

import logging

from django.db.models import Avg

from apps.company.models import Company, CompanyRating, UserCompanyFollow

logger = logging.getLogger(__name__)


def get_company_by_id(company_id: str | int) -> Company | None:
    """Resolve a company by numeric id; ``None`` when missing or non-numeric.

    The route segment is a string (FastAPI parity). Company ids are integers, so
    a segment that does not parse is simply "not found" -- the same 404 the
    legacy router surfaces.
    """
    try:
        pk = int(company_id)
    except (TypeError, ValueError):
        return None
    return Company.objects.filter(pk=pk).first()


def get_company_detail(company_id: str | int, user_id: int | None) -> Company | None:
    """Fetch a company plus the computed follower/rating + viewer state.

    Mirrors the legacy ``CompanyService.get_company`` response: ``follower_count``,
    ``avg_rating`` (rounded to one decimal) and, for an authenticated viewer,
    ``is_followed`` / ``user_rating``. Aggregates are computed in separate
    queries so the two to-many relations cannot cross-multiply in one join.
    """
    company = get_company_by_id(company_id)
    if company is None:
        return None

    company.follower_count = company.followers.count()
    average = company.ratings.aggregate(avg=Avg("score"))["avg"]
    company.avg_rating = round(float(average), 1) if average is not None else None

    if user_id is not None:
        company.is_followed = UserCompanyFollow.objects.filter(
            user_id=user_id, company=company
        ).exists()
        company.user_rating = (
            company.ratings.filter(user_id=user_id).values_list("score", flat=True).first()
        )
    else:
        company.is_followed = None
        company.user_rating = None

    return company


def follow_company(user_id: int, company: Company) -> bool:
    """Add a follow; idempotent when the user already follows the company.

    A *newly created* follow kicks off a full company sync (worker-side, so the
    TMDB id lookup never blocks this request). The dispatch is best-effort: a
    broker failure is logged, never raised — a follow must not fail because the
    queue is down. Returns whether the follow was newly created.
    """
    _follow, created = UserCompanyFollow.objects.get_or_create(user_id=user_id, company=company)
    if created:
        try:
            from apps.integrations.tasks import sync_company

            sync_company.delay(company.pk)
        except Exception:  # noqa: BLE001 - a dispatch failure must not break the follow
            logger.exception("company sync dispatch failed for company %s", company.pk)
    return created


def unfollow_company(user_id: int, company: Company) -> None:
    """Remove a follow; a no-op when the user is not following the company."""
    UserCompanyFollow.objects.filter(user_id=user_id, company=company).delete()


def rate_company(user_id: int, company: Company, score: int) -> None:
    """Set or update the user's rating for the company."""
    CompanyRating.objects.update_or_create(
        user_id=user_id, company=company, defaults={"score": score}
    )


def unrate_company(user_id: int, company: Company) -> None:
    """Remove the user's rating; a no-op when the user has not rated."""
    CompanyRating.objects.filter(user_id=user_id, company=company).delete()
