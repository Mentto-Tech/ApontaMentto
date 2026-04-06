#!/bin/sh

echo "Running database migrations..."
alembic upgrade head
MIGRATION_EXIT=$?

if [ $MIGRATION_EXIT -ne 0 ]; then
    echo "Migration upgrade failed. Checking current state..."
    CURRENT=$(alembic current 2>&1 || echo "unknown")
    echo "Current alembic state: $CURRENT"

    if echo "$CURRENT" | grep -q "add_timesheet_sign_models"; then
        echo "Stamping to 9f1a2b3c4d5e (tables already exist in DB)..."
        alembic stamp 9f1a2b3c4d5e
        echo "Stamp done. Running upgrade head again..."
        alembic upgrade head || { echo "Migration still failing after stamp. Aborting."; exit 1; }
    else
        echo "Unknown migration state, aborting."
        exit 1
    fi
fi

set -e

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
            id=str(uuid.uuid4()),
            username=(name or email),
            email=email,
            hashed_password=hash_password(password),
            role="admin",
            hourly_rate=None,
        ))
        await session.commit()
        print(f"Admin '{email}' created.")

asyncio.run(seed())
EOF

echo "Starting API server..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
