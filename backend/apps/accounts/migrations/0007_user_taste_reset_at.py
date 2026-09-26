from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_remove_user_tmdb_id_user_tmdb_account_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="taste_reset_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
