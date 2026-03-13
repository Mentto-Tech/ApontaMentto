import os
import sys
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# Add the backend directory to the path so we can import our models
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

load_dotenv()

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import models so Alembic can detect them
from models import Base  # noqa: E402

target_metadata = Base.metadata


def get_url() -> str:
    url = os.getenv(
        "DATABASE_URL",
        "postgresql://apontamentto:apontamentto@localhost:5432/apontamentto",
    )
    # Render may provide postgres://; normalize to postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Alembic needs a sync driver; replace asyncpg with psycopg2
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    # Neon uses ssl=require (asyncpg) → sslmode=require (psycopg2)
    url = url.replace("?ssl=require", "?sslmode=require").replace("&ssl=require", "&sslmode=require")
    return url


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
