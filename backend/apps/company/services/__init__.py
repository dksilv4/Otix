"""Company domain services, re-exported for convenient imports."""

from apps.company.services.company import (
    follow_company,
    get_company_by_id,
    get_company_detail,
    rate_company,
    unfollow_company,
    unrate_company,
)

__all__ = [
    "follow_company",
    "get_company_by_id",
    "get_company_detail",
    "rate_company",
    "unfollow_company",
    "unrate_company",
]
