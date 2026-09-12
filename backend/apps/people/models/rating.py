"""Per-user people relationships: follows and 1-10 ratings."""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class UserPersonFollow(BaseModel):
    """A user follows a person."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="person_follows"
    )
    person = models.ForeignKey("people.Person", on_delete=models.CASCADE, related_name="followers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "user_person_follows"
        constraints = [
            models.UniqueConstraint(fields=["user", "person"], name="uq_user_person_follow")
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.person_id}"


class PersonRating(BaseModel):
    """A user's 1-10 rating of a person."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="person_ratings"
    )
    person = models.ForeignKey("people.Person", on_delete=models.CASCADE, related_name="ratings")
    score = models.IntegerField()

    class Meta(BaseModel.Meta):
        db_table = "person_ratings"
        constraints = [
            models.UniqueConstraint(fields=["user", "person"], name="uq_person_rating_user_person"),
            models.CheckConstraint(
                condition=models.Q(score__gte=1, score__lte=10),
                name="ck_person_rating_score_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.person_id}={self.score}"
