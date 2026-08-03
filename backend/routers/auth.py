import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from email_service import EmailService
from models import PasswordResetToken, User
from schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)
from security import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter()

# URL base do frontend — usada para montar o link de reset
APP_URL = os.getenv("FRONTEND_URL") or os.getenv("APP_URL", "http://localhost:5173")


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    email_domain = data.email.split("@")[1] if "@" in data.email else "sem-arroba"
    email_len = len(data.email)
    password_len = len(data.password)
    has_leading_space = data.password.startswith(" ")
    has_trailing_space = data.password.endswith(" ")

    logger.info(
        "[login] Tentativa recebida | domínio=%s email_len=%d password_len=%d "
        "pw_leading_space=%s pw_trailing_space=%s",
        email_domain, email_len, password_len, has_leading_space, has_trailing_space,
    )

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning("[login] Usuário não encontrado | domínio=%s", email_domain)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    if not verify_password(data.password, user.hashed_password):
        logger.warning(
            "[login] Senha incorreta | user_id=%s domínio=%s password_len=%d "
            "pw_leading_space=%s pw_trailing_space=%s",
            user.id, email_domain, password_len, has_leading_space, has_trailing_space,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    logger.info("[login] Autenticação bem-sucedida | user_id=%s", user.id)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


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
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


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
