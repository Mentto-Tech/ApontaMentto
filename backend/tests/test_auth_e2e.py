"""Testes ponta a ponta (HTTP -> ASGI -> SQLite) do fluxo de autenticação.

Cobrem login, validação de token, refresh com rotação e a recuperação de
sessão em caso de refresh concorrente (múltiplas abas/dispositivos).
"""
from datetime import datetime, timedelta

import pytest

from conftest import login, seed_refresh_token, seed_user


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_login_success_returns_tokens_and_user(client):
    seed_user()
    resp = login(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "user@mentto.com.br"


def test_login_wrong_password_rejected(client):
    seed_user()
    resp = login(client, password="senha-errada")
    assert resp.status_code == 401


def test_login_unknown_email_rejected(client):
    resp = login(client, email="nao-existe@mentto.com.br")
    assert resp.status_code == 401


def test_me_with_valid_token(client):
    user_id = seed_user()
    token = login(client).json()["access_token"]
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["id"] == user_id


def test_me_with_invalid_token_rejected(client):
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer token-invalido"})
    assert resp.status_code == 401


def test_register_then_login(client):
    resp = client.post(
        "/api/auth/register",
        json={
            "name": "novo.usuario",
            "email": "novo@mentto.com.br",
            "password": "senha12345",
            "category": "clt",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]

    login_resp = login(client, email="novo@mentto.com.br", password="senha12345")
    assert login_resp.status_code == 200


def test_register_duplicate_email_rejected(client):
    seed_user(email="dup@mentto.com.br")
    resp = client.post(
        "/api/auth/register",
        json={
            "name": "outro.usuario",
            "email": "dup@mentto.com.br",
            "password": "senha12345",
            "category": "clt",
        },
    )
    assert resp.status_code == 400


def test_refresh_rotates_and_old_token_recovers_session(client):
    """Cenário real: duas abas com o mesmo refresh token.

    - Aba A faz refresh -> recebe R2 (R1 é revogado).
    - Aba B (token antigo R1) tenta refresh -> NÃO pode ser derrubado com 401;
      deve recuperar a sessão rotacionando a partir do token atual (R3).
    """
    seed_user()
    r1 = login(client).json()["refresh_token"]

    # Aba A: rotação normal
    resp_a = client.post("/api/auth/refresh", json={"refresh_token": r1})
    assert resp_a.status_code == 200
    r2 = resp_a.json()["refresh_token"]
    assert r2 != r1

    # Aba B: apresenta o token antigo (concorrente) -> recupera sessão
    resp_b = client.post("/api/auth/refresh", json={"refresh_token": r1})
    assert resp_b.status_code == 200
    r3 = resp_b.json()["refresh_token"]
    assert r3 not in (r1, r2)

    # A sessão recuperada é utilizável de verdade (fim a fim)
    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {resp_b.json()['access_token']}"}
    )
    assert me.status_code == 200

    # Cadeia: R2 já foi rotacionado pelo passo da Aba B -> também recupera
    resp_c = client.post("/api/auth/refresh", json={"refresh_token": r2})
    assert resp_c.status_code == 200
    r4 = resp_c.json()["refresh_token"]
    assert r4 not in (r1, r2, r3)


def test_refresh_unknown_token_rejected(client):
    resp = client.post("/api/auth/refresh", json={"refresh_token": "token-inexistente"})
    assert resp.status_code == 401


def test_refresh_with_access_token_rejected(client):
    seed_user()
    access = login(client).json()["access_token"]
    resp = client.post("/api/auth/refresh", json={"refresh_token": access})
    assert resp.status_code == 401


def test_refresh_expired_token_rejected(client):
    user_id = seed_user()
    seed_refresh_token(
        user_id=user_id,
        token="token-expirado",
        expires_at=datetime.utcnow() - timedelta(minutes=1),
    )
    resp = client.post("/api/auth/refresh", json={"refresh_token": "token-expirado"})
    assert resp.status_code == 401


def test_refresh_revoked_without_valid_chain_rejected(client):
    """Token revogado sem substituto vivo não deve mais ser aceito."""
    user_id = seed_user()
    seed_refresh_token(
        user_id=user_id,
        token="token-revogado-velho",
        expires_at=datetime.utcnow() + timedelta(days=1),
        revoked=True,
    )
    resp = client.post("/api/auth/refresh", json={"refresh_token": "token-revogado-velho"})
    assert resp.status_code == 401


def test_full_flow_logout_survives_refresh(client):
    """Fluxo completo: login -> várias operações autenticadas -> refresh -> segue autenticado."""
    seed_user()
    tokens = login(client).json()

    for _ in range(3):
        me = client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
        )
        assert me.status_code == 200

    refreshed = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200

    me_after = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    )
    assert me_after.status_code == 200