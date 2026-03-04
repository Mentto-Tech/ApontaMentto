#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

# Run seed script if it exists (gitignored — local only)
if [ -f "seed.py" ]; then
  echo "Running seed script..."
  python seed.py
fi

echo "Starting API server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
