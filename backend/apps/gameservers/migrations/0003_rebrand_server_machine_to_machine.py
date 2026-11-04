# Generated for Otix Nodes & Machines Rebranding

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gameservers', '0002_dedicatedgameserver_server_machine'),
        ('library', '0018_rebrand_server_machines_and_node_downloads'),
    ]

    operations = [
        migrations.RenameField(
            model_name='dedicatedgameserver',
            old_name='server_machine',
            new_name='machine',
        ),
        migrations.AlterField(
            model_name='dedicatedgameserver',
            name='machine',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='game_servers',
                to='library.usermachine',
            ),
        ),
    ]
