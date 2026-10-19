# Generated for user node is_local_desktop support

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0009_userhome_usernode_home_userservermachine'),
    ]

    operations = [
        migrations.AddField(
            model_name='usernode',
            name='is_local_desktop',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
