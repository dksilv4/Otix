"""Media credits: link a person to a media item in a role."""

from django.db import models

from core.models import BaseModel


class MediaCredit(BaseModel):
    """A person's credited role on a media item."""

    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="credits"
    )
    person = models.ForeignKey("people.Person", on_delete=models.CASCADE, related_name="credits")
    role = models.CharField(max_length=50)
    character_name = models.CharField(max_length=500, null=True, blank=True)
    sort_order = models.IntegerField(default=0)

    class Meta(BaseModel.Meta):
        db_table = "media_credits"

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.person_id}:{self.role}"
