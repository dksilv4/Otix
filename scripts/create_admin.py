#!/usr/bin/env python3
"""Create an admin user in the Otix database.

Usage:
    python scripts/create_admin.py admin@example.com adminuser password123
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import os
os.environ.setdefault("OTIX_SETTINGS_MODULE", "otix.infrastructure.config")


async def main():
    if len(sys.argv) < 4:
        print("Usage: python scripts/create_admin.py <email> <username> <password>")
        sys.exit(1)

    email = sys.argv[1]
    username = sys.argv[2]
    password = sys.argv[3]

    from otix.infrastructure.database import async_session
    from otix.services.auth.auth_service import hash_password
    from otix.domain.user import User
    from sqlalchemy import select

    async with async_session() as session:
        existing = await session.scalar(
            select(User).where((User.email == email) | (User.username == username))
        )
        if existing:
            print(f"User already exists: {existing.email} / {existing.username}")
            if not existing.is_admin:
                existing.is_admin = True
                await session.commit()
                print(f"Promoted {existing.username} to admin.")
            return

        user = User(
            email=email,
            username=username,
            hashed_password=hash_password(password),
            is_admin=True,
            is_verified=True,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        print(f"Admin user created: {email} / {username}")
        print(f"User ID: {user.id}")


if __name__ == "__main__":
    asyncio.run(main())
