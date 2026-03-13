import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://apontamentto:apontamentto@localhost:5432/apontamentto",
)

def _normalize_async_database_url(raw_url: str) -> tuple[str, dict]:
    """Normalize Postgres URLs for SQLAlchemy asyncpg.

    - Render/Neon may provide `postgres://` or `postgresql://`; we use `postgresql+asyncpg://`.
    - libpq-style query params like `sslmode=require` / `channel_binding=require` must not end up in
      the path (dbname). We strip them from the query and instead pass SSL via `connect_args`.
    """

    url = raw_url.strip()

    # Normalize driver prefix
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    parts = urlsplit(url)
    query_items = parse_qsl(parts.query, keep_blank_values=True)

    ssl_required = False
    for key, value in query_items:
        if key in {"ssl", "sslmode"} and value.lower() == "require":
            ssl_required = True

    # These are libpq params; asyncpg doesn't need them in the URL query.
    strip_keys = {"ssl", "sslmode", "channel_binding"}
    filtered_items = [(k, v) for (k, v) in query_items if k not in strip_keys]
    new_query = urlencode(filtered_items, doseq=True)

    normalized_url = urlunsplit(
        (parts.scheme, parts.netloc, parts.path, new_query, parts.fragment)
    )

    connect_args = {"ssl": "require"} if ssl_required else {}
    return normalized_url, connect_args


DATABASE_URL, connect_args = _normalize_async_database_url(DATABASE_URL)

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=connect_args)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
