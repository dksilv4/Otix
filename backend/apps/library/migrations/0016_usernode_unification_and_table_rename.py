# Generated for Otix Nodes Architecture Overhaul - Milestone 1

import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def set_default_machine_ids(apps, schema_editor):
    UserNode = apps.get_model('library', 'UserNode')
    for node in UserNode.objects.all():
        node.machine_id = uuid.uuid4()
        node.save(update_fields=['machine_id'])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('library', '0015_userhome_bssid_userhome_gateway_mac_and_more'),
    ]

    operations = [
        # 1. Rename table from user_game_servers to user_nodes
        migrations.AlterModelTable(
            name='usernode',
            table='user_nodes',
        ),
        # 2. Rename auth_token to api_key and update field attributes
        migrations.RenameField(
            model_name='usernode',
            old_name='auth_token',
            new_name='api_key',
        ),
        migrations.AlterField(
            model_name='usernode',
            name='api_key',
            field=models.CharField(blank=True, db_index=True, default='', max_length=512),
        ),
        # 3. Rename last_seen_at to last_heartbeat and update field attributes
        migrations.RenameField(
            model_name='usernode',
            old_name='last_seen_at',
            new_name='last_heartbeat',
        ),
        migrations.AlterField(
            model_name='usernode',
            name='last_heartbeat',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        # 4. Alter is_online field attributes
        migrations.AlterField(
            model_name='usernode',
            name='is_online',
            field=models.BooleanField(db_index=True, default=True),
        ),
        # 5. Alter user ForeignKey related_name to "nodes"
        migrations.AlterField(
            model_name='usernode',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='nodes',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        # 6. Add machine_id field (nullable without default, backfill unique UUIDs per row, then enforce unique)
        migrations.AddField(
            model_name='usernode',
            name='machine_id',
            field=models.UUIDField(null=True, blank=True),
        ),
        migrations.RunPython(set_default_machine_ids, reverse_code=migrations.RunPython.noop),
        migrations.AlterField(
            model_name='usernode',
            name='machine_id',
            field=models.UUIDField(
                db_index=True,
                default=uuid.uuid4,
                help_text='Immutable hardware/daemon UUID identifier',
                unique=True,
            ),
        ),
        # 7. Add primary_url
        migrations.AddField(
            model_name='usernode',
            name='primary_url',
            field=models.CharField(blank=True, default='', max_length=2048),
        ),
        # 8. Add local_ip
        migrations.AddField(
            model_name='usernode',
            name='local_ip',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        # 9. Add port
        migrations.AddField(
            model_name='usernode',
            name='port',
            field=models.IntegerField(default=7777),
        ),
        # 10. Add network_interfaces
        migrations.AddField(
            model_name='usernode',
            name='network_interfaces',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="List of classified interfaces: [{'type': 'lan'|'tailscale'|'loopback'|'docker', 'ip': '...', 'url': '...', 'priority': int}]",
            ),
        ),
        # 11. Add system_stats
        migrations.AddField(
            model_name='usernode',
            name='system_stats',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Telemetry metrics: cpu_percent, memory_used_bytes, memory_total_bytes, disk stats',
            ),
        ),
        # 12. Add version
        migrations.AddField(
            model_name='usernode',
            name='version',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        # 13. Update NodeDownload related_name
        migrations.AlterField(
            model_name='nodedownload',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='node_downloads',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='nodedownload',
            name='media_item',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='node_downloads',
                to='media.mediaitem',
            ),
        ),
    ]
