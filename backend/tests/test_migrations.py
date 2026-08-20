"""Testes da cadeia de migrações do Alembic.

A migração inicial (001) usa SQL específico do PostgreSQL (pg_type), então o
upgrade completo não roda em SQLite. Aqui validamos:

1. O grafo de revisões resolve para um único head (a migração nova).
2. O arquivo da migração nova adiciona a coluna `replaced_by_id`.
3. Upgrade real em um PostgreSQL disponível via TEST_DATABASE_URL (opt-in,
   utilizado em CI com Postgres; sem variável o teste é pulado).
"""
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

NEW_REVISION = "m9n0o1p2q3r4"
PREV_REVISION = "l7g8h9i0j1k2"


@pytest.fixture
def alembic_cfg():
    from alembic.config import Config

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    return cfg


def test_migration_graph_has_single_head(alembic_cfg):
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(alembic_cfg)
    heads = set(script.get_heads())
    assert heads == {NEW_REVISION}, f"heads inesperados: {heads}"


def test_new_migration_is_linear_chain(alembic_cfg):
    from alembic.script import ScriptDirectory

    script = ScriptDirectory.from_config(alembic_cfg)
    rev = script.get_revision(NEW_REVISION)
    assert rev is not None
    assert rev.down_revision == PREV_REVISION


def test_new_migration_file_content(alembic_cfg):
    """A migração nova precisa adicionar replaced_by_id (coluna + FK) e remover no downgrade."""
    content = (BACKEND / "alembic" / "versions" / f"{NEW_REVISION}_refresh_token_replaced_by.py").read_text(
        encoding="utf-8"
    )
    assert "replaced_by_id" in content
    assert "add_column" in content
    assert "create_foreign_key" in content
    assert "drop_constraint" in content
    assert "drop_column" in content
    assert f'down_revision = "{PREV_REVISION}"' in content


def test_all_version_files_compile():
    import py_compile

    versions = BACKEND / "alembic" / "versions"
    for path in versions.glob("*.py"):
        py_compile.compile(str(path), doraise=True)


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL não definida — requer um PostgreSQL para rodar o upgrade real",
)
def test_upgrade_head_on_postgres(alembic_cfg):
    """Upgrade ponta a ponta das migrações em PostgreSQL real.

    Uso (ex.: CI ou dev com Postgres local):
        TEST_DATABASE_URL=postgresql://user:pass@host:5432/db python -m pytest tests/test_migrations.py
    """
    import sqlalchemy as sa
    from alembic import command

    url = os.environ["TEST_DATABASE_URL"]
    # Garante driver síncrono para o Alembic
    url = url.replace("postgres://", "postgresql://").replace("postgresql+asyncpg://", "postgresql://")

    engine = sa.create_engine(url)
    conn = engine.connect()
    try:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
        conn.commit()
    finally:
        conn.close()
    engine.dispose()

    os.environ["DATABASE_URL"] = url
    command.upgrade(alembic_cfg, "head")

    engine = sa.create_engine(url)
    insp = sa.inspect(engine)
    cols = {c["name"] for c in insp.get_columns("refresh_tokens")}
    engine.dispose()

    assert "replaced_by_id" in cols, f"colunas presentes: {cols}"