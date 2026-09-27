from django.db import migrations


def run_genre_simplification(apps, schema_editor):
    from apps.media.services.genre_simplification import backfill_genres
    backfill_genres()


def reverse_genre_simplification(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('media', '0018_blockedrecommendation'),
    ]

    operations = [
        migrations.RunPython(run_genre_simplification, reverse_genre_simplification),
    ]
