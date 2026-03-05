import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://apontamentto:apontamentto@localhost:5432/apontamentto",
)

# Normalise driver prefix: Neon/Render sometimes emit plain postgres:// or postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Neon requires SSL; asyncpg uses connect_args instead of query params
connect_args = {}
if "ssl=require" in DATABASE_URL or "sslmode=require" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("?ssl=require", "").replace("&ssl=require", "").replace("?sslmode=require", "").replace("&sslmode=require", "")
    connect_args = {"ssl": "require"}

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=connect_args)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
