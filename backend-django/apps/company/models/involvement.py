"""Involved companies: a company's role(s) on a media item."""

from django.db import models

from core.models import BaseModel


class InvolvedCompany(BaseModel):
    """A company's involvement on a media item, by role flags."""

    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="involved_companies"
    )
    company = models.ForeignKey(
        "company.Company", on_delete=models.CASCADE, related_name="involved_companies"
    )

    developer = models.BooleanField(default=False)
    publisher = models.BooleanField(default=False)
    porting = models.BooleanField(default=False)
    supporting = models.BooleanField(default=False)
    production = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        db_table = "involved_companies"

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.company_id}"
