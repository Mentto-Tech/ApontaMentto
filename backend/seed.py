"""Optional local seed script.

Creates an admin user and the internal project.
Not used by Render (Render uses backend/entrypoint.sh), but kept runnable.
"""

import asyncio
import os
import uuid
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Project, User
from security import hash_password

load_dotenv()

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
ADMIN_NAME = os.getenv("ADMIN_NAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

INTERNAL_PROJECT_NAME = "Atividades Internas"


async def seed() -> None:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("ADMIN_EMAIL/ADMIN_PASSWORD not set; nothing to seed.")
        return

    async with AsyncSessionLocal() as session:
        # --- Admin user ---
        existing_user = (
            await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        ).scalar_one_or_none()
        if existing_user:
            if existing_user.role != "admin":
                existing_user.role = "admin"
                await session.commit()
            print(f"Admin '{ADMIN_EMAIL}' already exists.")
        else:
            session.add(
                User(
                    id=str(uuid.uuid4()),
                    username=(ADMIN_NAME or ADMIN_EMAIL),
                    email=ADMIN_EMAIL,
                    hashed_password=hash_password(ADMIN_PASSWORD),
                    role="admin",
                    created_at=datetime.utcnow(),
                )
            )
            await session.commit()
            print(f"Admin '{ADMIN_EMAIL}' created.")

        # --- Internal project ---
        existing_project = (
            await session.execute(
                select(Project).where(Project.name == INTERNAL_PROJECT_NAME)
            )
        ).scalar_one_or_none()
        if existing_project:
            print(f"Project '{INTERNAL_PROJECT_NAME}' already exists.")
        else:
            session.add(
                Project(
                    id=str(uuid.uuid4()),
                    name=INTERNAL_PROJECT_NAME,
                    description="Planning, reviews e atividades internas",
                    color="#6366f1",
                    is_internal=True,
                    created_at=datetime.utcnow(),
                )
            )
            await session.commit()
            print(f"Project '{INTERNAL_PROJECT_NAME}' created.")


if __name__ == "__main__":
    asyncio.run(seed())
