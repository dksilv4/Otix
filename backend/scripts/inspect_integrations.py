import os
import sys

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from apps.library.models.user_node import UserNode
from apps.library.models.user_node_connection import UserNodeConnection
from apps.integrations.models.plex import UserPlexServer, UserPlexLibrary

print('--- UserNodes ---')
for n in UserNode.objects.all():
    print(f'Node id={n.id}, user_id={n.user_id}, name={n.name}, host={getattr(n, "host", "")}, is_local={getattr(n, "is_local", "")}')

print('--- UserNodeConnections ---')
for c in UserNodeConnection.objects.all():
    print(f'Conn id={c.id}, user_id={c.user_id}, radarr={c.radarr}, sonarr={c.sonarr}')

print('--- UserPlexServers ---')
for p in UserPlexServer.objects.all():
    print(f'Plex id={p.id}, user_id={p.user_id}, name={p.name}, base_url={p.base_url}, machine={p.machine_identifier}')

print('--- UserPlexLibraries ---')
for lib in UserPlexLibrary.objects.all():
    print(f'Library id={lib.id}, title={lib.title}, type={lib.library_type}, section_key={lib.section_key}')
