# Generated for Otix Nodes & Machines Rebranding

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('library', '0017_usergame_nodegamesource_and_more'),
        ('gameservers', '0002_dedicatedgameserver_server_machine'),
    ]

    operations = [
        # 1. Rename UserServerMachine to UserMachine
        migrations.RenameModel(
            old_name='UserServerMachine',
            new_name='UserMachine',
        ),
        migrations.AlterModelTable(
            name='usermachine',
            table='user_machines',
        ),
        migrations.AlterField(
            model_name='usermachine',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='machines',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='usermachine',
            name='home',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='machines',
                to='library.userhome',
            ),
        ),
        migrations.AlterField(
            model_name='usermachine',
            name='hosted_node',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='hosted_machines',
                to='library.usernode',
            ),
        ),
        migrations.AlterField(
            model_name='usermachine',
            name='smb_nodes',
            field=models.ManyToManyField(
                blank=True,
                related_name='smb_accessible_machines',
                to='library.usernode',
            ),
        ),

        # 2. Rebrand NodeDownload table and server -> node FK
        migrations.RemoveConstraint(
            model_name='nodedownload',
            name='uq_game_server_download_nzo',
        ),
        migrations.AlterModelTable(
            name='nodedownload',
            table='node_downloads',
        ),
        migrations.RenameField(
            model_name='nodedownload',
            old_name='server',
            new_name='node',
        ),
        migrations.AddConstraint(
            model_name='nodedownload',
            constraint=models.UniqueConstraint(
                fields=('node', 'nzo_id'),
                name='uq_node_download_nzo',
            ),
        ),

        # 3. Rename server_machine -> machine on StorageShare
        migrations.RenameField(
            model_name='storageshare',
            old_name='server_machine',
            new_name='machine',
        ),
    ]
