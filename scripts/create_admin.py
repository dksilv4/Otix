#!/usr/bin/env python3
"""Create an admin user in the Otix database.

Usage:
    python scripts/create_admin.py [email] [username] [password]
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@otix.local"
    username = sys.argv[2] if len(sys.argv) > 2 else "admin"
    password = sys.argv[3] if len(sys.argv) > 3 else "admin123"

    # If docker compose is available and running, delegate to api container
    docker_bin = shutil.which("docker")
    if docker_bin:
        cmd = [
            docker_bin,
            "compose",
            "exec",
            "-T",
            "api",
            "python",
            "manage.py",
            "create_admin",
            f"--username={username}",
            f"--email={email}",
            f"--password={password}",
        ]
        res = subprocess.run(cmd)
        if res.returncode == 0:
            return

    # Fallback to local Django setup on host
    backend_path = Path(__file__).resolve().parent.parent / "backend"
    sys.path.insert(0, str(backend_path))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

    import django
    django.setup()

    from django.core.management import call_command
    call_command("create_admin", username=username, email=email, password=password)


if __name__ == "__main__":
    main()

