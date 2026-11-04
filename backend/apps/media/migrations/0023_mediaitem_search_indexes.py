# Generated for search overhaul milestone 1

import django.contrib.postgres.indexes
from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models


def add_gin_trigram_index(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        model = apps.get_model("media", "MediaItem")
        schema_editor.add_index(
            model,
            django.contrib.postgres.indexes.GinIndex(
                fields=["title"],
                name="media_items_title_trgm_gin",
                opclasses=["gin_trgm_ops"],
            ),
        )


def remove_gin_trigram_index(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        model = apps.get_model("media", "MediaItem")
        schema_editor.remove_index(
            model,
            django.contrib.postgres.indexes.GinIndex(
                fields=["title"],
                name="media_items_title_trgm_gin",
                opclasses=["gin_trgm_ops"],
            ),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("media", "0022_mediaasset_dominant_color"),
    ]

    operations = [
        TrigramExtension(),
        migrations.AddIndex(
            model_name="mediaitem",
            index=models.Index(fields=["media_type"], name="media_items_media_type_idx"),
        ),
        migrations.AddIndex(
            model_name="mediaitem",
            index=models.Index(fields=["popularity"], name="media_items_popularity_idx"),
        ),
        migrations.AddIndex(
            model_name="mediaitem",
            index=models.Index(fields=["release_date"], name="media_items_release_date_idx"),
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddIndex(
                    model_name="mediaitem",
                    index=django.contrib.postgres.indexes.GinIndex(
                        fields=["title"],
                        name="media_items_title_trgm_gin",
                        opclasses=["gin_trgm_ops"],
                    ),
                ),
            ],
            database_operations=[
                migrations.RunPython(add_gin_trigram_index, remove_gin_trigram_index),
            ],
        ),
    ]
