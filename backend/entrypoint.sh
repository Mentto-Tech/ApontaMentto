#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Creating admin user if not exists..."
python - <<'EOF'
import asyncio, os, uuid
from database import AsyncSessionLocal
from models import User
from security import hash_password
from sqlalchemy import select

async def seed():
    email    = os.getenv("ADMIN_EMAIL")
    name     = os.getenv("ADMIN_NAME")
    password = os.getenv("ADMIN_PASSWORD")
    if not email or not password:
        print("ADMIN_EMAIL/ADMIN_PASSWORD not set, skipping seed.")
        return
    async with AsyncSessionLocal() as session:
        existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            print(f"Admin '{email}' already exists.")
            return
        session.add(User(
            id=str(uuid.uuid4()), name=name, email=email,
            hashed_password=hash_password(password), role="admin", hourly_rate=None,
        ))
        await session.commit()
        print(f"Admin '{email}' created.")

asyncio.run(seed())
EOF

echo "Starting API server..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
