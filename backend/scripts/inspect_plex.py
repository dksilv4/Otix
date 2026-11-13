import os
import sys

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from apps.integrations.models.plex import UserPlexServer
import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

for s in UserPlexServer.objects.all():
    print(f'Server: {s.name}, base_url={s.base_url}, token={s.access_token[:8]}...')
    try:
        url = f'{s.base_url}/library/sections?X-Plex-Token={s.access_token}'
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            dirs = data.get('MediaContainer', {}).get('Directory', [])
            print(f'Connected successfully! Sections count: {len(dirs)}')
            for d in dirs:
                print(f"  Section: {d.get('title')} (key={d.get('key')}, type={d.get('type')})")
    except Exception as e:
        print(f'Failed to query {s.base_url}: {e}')
