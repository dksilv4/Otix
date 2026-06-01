import asyncio
from datetime import date
from otix.infrastructure.database import async_session
from otix.domain.user import User
from otix.services.auth_service import hash_password


async def main():
    async with async_session() as session:
        from sqlalchemy import select

        existing = await session.scalar(select(User).where(User.username == "admin"))
        if existing:
            print("Admin user already exists")
            return

        user = User(
            email="admin@diogodasilva.com",
            username="admin",
            hashed_password=hash_password("password123"),
            is_admin=True,
            is_active=True,
            date_of_birth=date(1990, 1, 1),
        )
        session.add(user)
        await session.commit()
        print("Admin user created successfully!")


if __name__ == "__main__":
    asyncio.run(main())
