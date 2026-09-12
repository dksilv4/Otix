# Theme-scoped artwork pins: replace the single boolean is_selected with a
# nullable selected_context ('general' | 'dark' | 'light'). Existing pins carry
# forward as 'general' so behavior for already-chosen artwork is unchanged.

from django.db import migrations, models


def backfill_general(apps, schema_editor):
    MediaAsset = apps.get_model("media", "MediaAsset")
    MediaAsset.objects.filter(is_selected=True).update(selected_context="general")


class Migration(migrations.Migration):

    dependencies = [
        ("media", "0006_mediaasset_is_selected"),
    ]

    operations = [
        migrations.AddField(
            model_name="mediaasset",
            name="selected_context",
            field=models.CharField(blank=True, max_length=10, null=True),
        ),
        migrations.RunPython(backfill_general, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="mediaasset",
            name="is_selected",
        ),
    ]
