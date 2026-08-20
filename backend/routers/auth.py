import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from email_service import EmailService
from models import PasswordResetToken, RefreshToken, User
from schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)
from security import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter()

APP_URL = os.getenv("FRONTEND_URL") or os.getenv("APP_URL", "http://localhost:5173")

REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))


def _mask_token(token: str) -> str:
    """Máscara segura de token para auditoria — nunca expõe o token completo."""
    if not token:
        return "<vazio>"
    if len(token) <= 8:
        return f"<{len(token)} caracteres>"
    return f"{token[:4]}...{token[-4:]} (len={len(token)})"


def _client_info(request: Request) -> str:
    ip = request.client.host if request.client else "desconhecido"
    ua = (request.headers.get("user-agent") or "desconhecido")[:160]
    return f"ip={ip} ua={ua}"


async def _create_refresh_token(
    user_id: str,
    db: AsyncSession,
    replaced_by: "RefreshToken | None" = None,
) -> str:
    """Gera e persiste um refresh token rotativo.

    Quando `replaced_by` é informado, registra a linhagem da rotação
    (o token antigo aponta para o novo) para detectar refresh concorrente.
    """
    raw = secrets.token_urlsafe(48)
    rt = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token=raw,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)
    await db.flush()
    if replaced_by is not None:
        replaced_by.replaced_by_id = rt.id
    return raw


async def _find_live_replacement(db: AsyncSession, rt: RefreshToken) -> RefreshToken:
    """Segue a cadeia de rotação até encontrar o token atual (não revogado)."""
    current = rt
    visited = set()
    while current.replaced_by_id and current.id not in visited:
        visited.add(current.id)
        next_rt = await db.get(RefreshToken, current.replaced_by_id)
        if not next_rt:
            break
        current = next_rt
    return current


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    client = _client_info(request)
    email_domain = data.email.split("@")[1] if "@" in data.email else "sem-arroba"
    email_len = len(data.email)
    password_len = len(data.password)
    has_leading_space = data.password.startswith(" ")
    has_trailing_space = data.password.endswith(" ")

    logger.info(
        "[login] Tentativa recebida | %s domínio=%s email_len=%d password_len=%d "
        "pw_leading_space=%s pw_trailing_space=%s",
        client, email_domain, email_len, password_len, has_leading_space, has_trailing_space,
    )

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning(
            "[login] Falha: usuario_nao_encontrado | %s domínio=%s email_len=%d",
            client, email_domain, email_len,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    if not verify_password(data.password, user.hashed_password):
        logger.warning(
            "[login] Falha: senha_incorreta | user_id=%s %s domínio=%s password_len=%d "
            "pw_leading_space=%s pw_trailing_space=%s",
            user.id, client, email_domain, password_len, has_leading_space, has_trailing_space,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    logger.info(
        "[login] Sucesso | user_id=%s %s domínio=%s email_len=%d",
        user.id, client, email_domain, email_len,
    )
    token = create_access_token({"sub": user.id})
    refresh = await _create_refresh_token(user.id, db)
    await db.commit()
    return TokenResponse(access_token=token, refresh_token=refresh, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user = User(
        id=str(uuid.uuid4()),
        username=data.name,
        email=data.email,
        hashed_password=hash_password(data.password),
        role="user",
        category=data.category,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Nome de usuário já cadastrado")
    await db.refresh(user)
    token = create_access_token({"sub": user.id})
    refresh = await _create_refresh_token(user.id, db)
    await db.commit()
    return TokenResponse(access_token=token, refresh_token=refresh, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Troca um refresh token válido por um novo par (rotação).

    Se o token apresentado já foi revogado por uma rotação anterior (ex.:
    outra aba/dispositivo usando o mesmo token em paralelo), tenta recuperar
    a sessão rotacionando o token atual da mesma linhagem em vez de derrubar
    o usuário com 401.
    """
    client = _client_info(request)
    masked = _mask_token(data.refresh_token)

    logger.info("[refresh] Recebido | %s token=%s", client, masked)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == data.refresh_token)
    )
    rt = result.scalar_one_or_none()

    if not rt:
        logger.warning(
            "[refresh] Falha: token_nao_encontrado | %s token=%s",
            client, masked,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado. Faça login novamente.",
        )

    if rt.expires_at < datetime.utcnow():
        age_days = (datetime.utcnow() - rt.created_at).total_seconds() / 86400
        logger.warning(
            "[refresh] Falha: token_expirado | user_id=%s %s token=%s idade_dias=%.1f",
            rt.user_id, client, masked, age_days,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado. Faça login novamente.",
        )

    if rt.revoked:
        # Refresh concorrente: outro cliente já consumiu este token na rotação.
        live = await _find_live_replacement(db, rt)
        if live.id != rt.id and not live.revoked and live.expires_at >= datetime.utcnow():
            live.revoked = True
            new_refresh = await _create_refresh_token(rt.user_id, db, replaced_by=live)
            user = await db.get(User, rt.user_id)
            if not user:
                await db.commit()
                logger.warning(
                    "[refresh] Falha: usuario_nao_encontrado | user_id=%s %s",
                    rt.user_id, client,
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Usuário não encontrado.",
                )
            new_access = create_access_token({"sub": user.id})
            await db.commit()
            logger.warning(
                "[refresh] Sucesso apos reuso concorrente | user_id=%s %s token_apresentado=%s token_atual=%s",
                rt.user_id, client, masked, _mask_token(live.token),
            )
            return TokenResponse(
                access_token=new_access,
                refresh_token=new_refresh,
                user=UserOut.model_validate(user),
            )

        logger.warning(
            "[refresh] Falha: token_revogado_sem_cadeia_valida | user_id=%s %s token=%s",
            rt.user_id, client, masked,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado. Faça login novamente.",
        )

    # Rotação normal
    rt.revoked = True
    user = await db.get(User, rt.user_id)
    if not user:
        await db.commit()
        logger.warning(
            "[refresh] Falha: usuario_nao_encontrado | user_id=%s %s",
            rt.user_id, client,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado.",
        )
    new_access = create_access_token({"sub": user.id})
    new_refresh = await _create_refresh_token(user.id, db, replaced_by=rt)
    await db.commit()
    logger.info(
        "[refresh] Sucesso | user_id=%s %s token=%s",
        user.id, client, masked,
    )
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        user=UserOut.model_validate(user),
    )


# ---------------------------------------------------------------------------
# Recuperação de senha
# ---------------------------------------------------------------------------

@router.post("/forgot-password", status_code=200)
async def forgot_password(
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Solicita redefinição de senha via email.
    Sempre retorna a mesma mensagem genérica para evitar user enumeration.
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user:
        # Invalida tokens anteriores deste usuário (limpeza)
        existing = await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used == False,  # noqa: E712
            )
        )
        for old_token in existing.scalars().all():
            old_token.used = True

        raw_token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token=raw_token,
            expires_at=datetime.utcnow() + timedelta(hours=1),
            used=False,
        )
        db.add(reset_token)
        await db.commit()

        reset_url = f"{APP_URL}/reset-password?token={raw_token}"

        def _send_email():
            try:
                EmailService.send_password_reset_email(
                    to_email=user.email,
                    user_name=user.username,
                    reset_url=reset_url,
                )
            except Exception as exc:
                logger.error(f"Erro ao enviar email de reset para {user.email}: {exc}")

        background_tasks.add_task(_send_email)

    # Resposta genérica — não revela se o email existe ou não
    return {
        "message": "Se este email estiver cadastrado, você receberá as instruções em breve."
    }


@router.post("/reset-password", status_code=200)
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Redefine a senha usando o token recebido por email.
    """
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="A senha deve ter pelo menos 8 caracteres.",
        )

    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == data.token)
    )
    reset_token = result.scalar_one_or_none()

    if (
        not reset_token
        or reset_token.used
        or reset_token.expires_at < datetime.utcnow()
    ):
        raise HTTPException(
            status_code=400,
            detail="Token inválido ou expirado. Solicite um novo link de recuperação.",
        )

    # Atualiza a senha do usuário
    user_result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    user.hashed_password = hash_password(data.new_password)

    # Invalida o token (one-time use)
    reset_token.used = True

    await db.commit()

    return {"message": "Senha redefinida com sucesso. Você já pode fazer login."}
