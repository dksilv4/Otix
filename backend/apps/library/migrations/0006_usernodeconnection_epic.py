# Generated manually for backend-as-node Epic vault

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("library", "0005_usernodeconnection_libraries_organize"),
    ]

    operations = [
        migrations.AddField(
            model_name="usernodeconnection",
            name="epic",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
