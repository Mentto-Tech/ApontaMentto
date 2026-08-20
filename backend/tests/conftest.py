import os
import sys
import tempfile
import uuid
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ["SECRET_KEY"] = "test-secret-key-at-least-32-chars-long"
os.environ["REFRESH_TOKEN_EXPIRE_DAYS"] = "30"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "30"

import sqlalchemy as sa  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from database import Base, get_db  # noqa: E402
import models  # noqa: E402,F401  (registra tabelas no metadata)
from main import app  # noqa: E402

from security import hash_password  # noqa: E402

TEST_DB_PATH = Path(tempfile.gettempdir()) / "apontamentto_e2e.db"
_TEST_DB_URL = f"sqlite:///{TEST_DB_PATH.as_posix()}"
_TEST_DB_URL_ASYNC = f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}"

if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()


def _sync_engine():
    return sa.create_engine(_TEST_DB_URL)


# Cria o schema uma única vez com engine síncrona (evita problema de event loop)
_schema_engine = _sync_engine()
Base.metadata.create_all(_schema_engine)
_schema_engine.dispose()

# Engine assíncrono usado pelo app (mesmo arquivo sqlite)
_app_engine = create_async_engine(_TEST_DB_URL_ASYNC)
_AppSession = async_sessionmaker(_app_engine, expire_on_commit=False)


async def _override_get_db():
    async with _AppSession() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


def seed_user(
    email="user@mentto.com.br",
    password="senha12345",
    username="usuario",
    role="user",
    category="clt",
):
    """Insere um usuário direto no banco de teste (sem passar pela API)."""
    user_id = str(uuid.uuid4())
    values = {
        "id": user_id,
        "username": username,
        "email": email,
        "hashed_password": hash_password(password),
        "role": role,
        "category": category,
    }
    with _sync_engine().begin() as conn:
        conn.execute(sa.insert(models.User.__table__).values(**values))
    return user_id


def seed_refresh_token(user_id, token, expires_at, revoked=False):
    """Insere um refresh token direto no banco de teste."""
    with _sync_engine().begin() as conn:
        conn.execute(
            sa.insert(models.RefreshToken.__table__).values(
                id=str(uuid.uuid4()),
                user_id=user_id,
                token=token,
                expires_at=expires_at,
                revoked=revoked,
            )
        )


def login(client, email="user@mentto.com.br", password="senha12345"):
    """Helper: efetua login e retorna o corpo da resposta (dict)."""
    return client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )


@pytest.fixture(scope="module")
def client():
    # Sem context manager: o lifespan (push scheduler) não roda e o teste
    # nunca toca no banco de produção configurado no .env.
    return TestClient(app)


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_db():
    yield
    _app_engine.dispose()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except OSError:
            # No Windows o arquivo sqlite pode continuar aberto por uma thread
            # do aiosqlite; é um arquivo temporário, deixar para trás é inofensivo.
            pass


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    with _sync_engine().begin() as conn:
        conn.execute(sa.text("DELETE FROM refresh_tokens"))
        conn.execute(sa.text("DELETE FROM users"))