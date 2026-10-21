from django.db import migrations

from core.image_url import clean_image_url


def clean_media_asset_urls(apps, schema_editor):
    MediaAsset = apps.get_model("media", "MediaAsset")
    for asset in MediaAsset.objects.filter(url__icontains="uploads").iterator():
        cleaned = clean_image_url(asset.url)
        if cleaned != asset.url:
            asset.url = cleaned
            asset.save(update_fields=["url"])

    for asset in MediaAsset.objects.filter(url__startswith="http://").iterator():
        cleaned = clean_image_url(asset.url)
        if cleaned != asset.url:
            asset.url = cleaned
            asset.save(update_fields=["url"])


class Migration(migrations.Migration):

    dependencies = [
        ("media", "0019_genre_simplification_backfill"),
    ]

    operations = [
        migrations.RunPython(clean_media_asset_urls, migrations.RunPython.noop),
    ]
