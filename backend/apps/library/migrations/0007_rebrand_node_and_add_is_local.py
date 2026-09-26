# Generated for node rebrand and is_local support

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0006_alter_usernodeconnection_options_and_more'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='UserGameServer',
            new_name='UserNode',
        ),
        migrations.RenameModel(
            old_name='GameServerDownload',
            new_name='NodeDownload',
        ),
        migrations.AddField(
            model_name='usernode',
            name='is_local',
            field=models.BooleanField(default=False),
        ),
    ]
