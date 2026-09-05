"""Per-user company relationships: follows and 1-10 ratings."""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class UserCompanyFollow(BaseModel):
    """A user follows a company."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company_follows"
    )
    company = models.ForeignKey(
        "company.Company", on_delete=models.CASCADE, related_name="followers"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "user_company_follows"
        constraints = [
            models.UniqueConstraint(fields=["user", "company"], name="uq_user_company_follow")
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.company_id}"


class CompanyRating(BaseModel):
    """A user's 1-10 rating of a company."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company_ratings"
    )
    company = models.ForeignKey(
        "company.Company", on_delete=models.CASCADE, related_name="ratings"
    )
    score = models.IntegerField()

    class Meta(BaseModel.Meta):
        db_table = "company_ratings"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "company"], name="uq_company_rating_user_company"
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=1, score__lte=10),
                name="ck_company_rating_score_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.company_id}={self.score}"
