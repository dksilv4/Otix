import os
import sys

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from apps.library.models.user_node import UserNode
from apps.library.services.node import usenet_get_config

node = UserNode.objects.filter(id=115).first()
if node:
    status_code, u_cfg = usenet_get_config(node)
    print('Node 115 Usenet config (status', status_code, '):', u_cfg)
