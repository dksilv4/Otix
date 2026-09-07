"""Catalog search-log rows used for gap/zero-result analysis."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class SearchLog(TimestampedModel):
    """A single catalog search request recorded for gap analysis."""

    query = models.CharField(max_length=500)
    media_type = models.CharField(max_length=10, null=True, blank=True)
    sort_by = models.CharField(max_length=20, null=True, blank=True)
    page = models.IntegerField()
    page_size = models.IntegerField()
    result_count = models.IntegerField(null=True, blank=True)
    items_returned = models.IntegerField()
    tracks_returned = models.IntegerField(default=0)
    backfill_triggered = models.BooleanField(default=False)
    cache_hit = models.BooleanField(default=False)
    query_embedding_available = models.BooleanField(null=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="search_logs",
    )
    is_bot = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        db_table = "search_logs"

    def __str__(self) -> str:
        return f"{self.user_id}:{self.query}"
