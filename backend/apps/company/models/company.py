"""Company: production/publishing companies in the catalog."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from core.models import BaseModel


class Company(BaseModel):
    """A production/development/publishing company."""

    name = models.CharField(max_length=500)
    slug = models.CharField(max_length=500, unique=True)
    logo_url = models.CharField(max_length=2000, null=True, blank=True)
    origin_country = models.CharField(max_length=10, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    homepage = models.URLField(max_length=500, null=True, blank=True)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="company",
    )

    class Meta(BaseModel.Meta):
        db_table = "companies"

    def __str__(self) -> str:
        return self.name
