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

s = UserPlexServer.objects.filter(base_url__contains='192-168-1-28').first()
if s:
    url = f'{s.base_url}/library/sections/1/all?X-Plex-Token={s.access_token}'
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
        data = json.loads(resp.read().decode())
        meta = data.get('MediaContainer', {}).get('Metadata', [])
        titles = {m.get('title').lower(): m for m in meta}
        check_titles = ['big buck bunny', 'tears of steel', 'night of the living dead', 'the substance', 'terrifier 3']
        for t in check_titles:
            match = titles.get(t)
            if match:
                print(f"FOUND in Plex: '{match.get('title')}' ({match.get('year')}) ratingKey={match.get('ratingKey')}")
            else:
                print(f"NOT in Plex: '{t}'")
