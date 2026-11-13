import os
import sys

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from apps.library.models.user_node import UserNode
from apps.library.services.node import radarr_get_config, sonarr_get_config

node = UserNode.objects.filter(id=115).first()
if node:
    status_code, r_cfg = radarr_get_config(node)
    print('Node 115 Radarr config (status', status_code, '):', r_cfg)
    status_code, s_cfg = sonarr_get_config(node)
    print('Node 115 Sonarr config (status', status_code, '):', s_cfg)
