# Generated manually to remove audio / music catalog models

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("media", "0011_externalid_hash_match_count_db_default"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="mediaitem",
            name="ck_media_type",
        ),
        migrations.AddConstraint(
            model_name="mediaitem",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    media_type__in=["movie", "show", "season", "episode", "game"]
                ),
                name="ck_media_type",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="mediagenretype",
            name="ck_genre_media_type",
        ),
        migrations.AddConstraint(
            model_name="mediagenretype",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    media_type__in=["movie", "show", "game"]
                ),
                name="ck_genre_media_type",
            ),
        ),
        migrations.DeleteModel(
            name="TrackRating",
        ),
        migrations.DeleteModel(
            name="Track",
        ),
        migrations.DeleteModel(
            name="Album",
        ),
    ]
