from django.db import migrations

from core.image_url import clean_image_url


def clean_user_image_urls(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.all():
        update_fields = []
        cleaned_avatar = clean_image_url(user.avatar_url)
        if cleaned_avatar != user.avatar_url:
            user.avatar_url = cleaned_avatar
            update_fields.append("avatar_url")
        cleaned_bg = clean_image_url(user.background_url)
        if cleaned_bg != user.background_url:
            user.background_url = cleaned_bg
            update_fields.append("background_url")
        cleaned_g_avatar = clean_image_url(user.google_avatar_url)
        if cleaned_g_avatar != user.google_avatar_url:
            user.google_avatar_url = cleaned_g_avatar
            update_fields.append("google_avatar_url")
        if update_fields:
            user.save(update_fields=update_fields)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0010_user_game_sessions_private_user_save_game_sessions"),
    ]

    operations = [
        migrations.RunPython(clean_user_image_urls, migrations.RunPython.noop),
    ]
