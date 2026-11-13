import os
import sys

sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
import django
django.setup()

from django.contrib.auth import get_user_model
from apps.accounts.services.tokens import create_access_token

User = get_user_model()
admin_user = User.objects.filter(id=1).first()
if admin_user:
    token = create_access_token(admin_user.pk)
    print(f'ADMIN_USER_ID={admin_user.id}')
    print(f'ADMIN_USERNAME={admin_user.username}')
    print(f'ACCESS_TOKEN={token}')
