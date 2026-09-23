#!/usr/bin/env python3
"""Create an admin user in the Otix database.

Usage:
    python scripts/create_admin.py
    python scripts/create_admin.py [username] [email] [password]
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    args = sys.argv[1:]

    # If docker compose is available, delegate to api container
    docker_bin = shutil.which("docker")
    if docker_bin:
        cmd = [
            docker_bin,
            "compose",
            "exec",
            "api",
            "python",
            "manage.py",
            "create_admin",
        ]
        if len(args) >= 1:
            cmd.append(f"--username={args[0]}")
        if len(args) >= 2:
            cmd.append(f"--email={args[1]}")
        if len(args) >= 3:
            cmd.append(f"--password={args[2]}")
            cmd.append("--no-input")

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

    kwargs = {}
    if len(args) >= 1:
        kwargs["username"] = args[0]
    if len(args) >= 2:
        kwargs["email"] = args[1]
    if len(args) >= 3:
        kwargs["password"] = args[2]
        kwargs["no_input"] = True

    call_command("create_admin", **kwargs)


if __name__ == "__main__":
    main()
