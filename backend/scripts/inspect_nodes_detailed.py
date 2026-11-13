import os
import sys

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from apps.library.models.user_node import UserNode

for n in UserNode.objects.filter(user_id=1):
    print(f'Node id={n.id}, name={n.name}, is_online={n.is_online}, primary={n.primary_url}, local={n.local_url}, remote={n.remote_url}, ip={n.local_ip}')
