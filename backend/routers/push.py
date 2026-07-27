import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import PushSubscription, User
from push_service import get_vapid_public_key, send_push_payload

router = APIRouter()


class PushKeysSchema(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: PushKeysSchema


class PushUnsubscribeIn(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
async def get_vapid_key():
    """Retorna a chave pública VAPID para uso no PushManager do navegador."""
    pub_key = get_vapid_public_key()
    return {"publicKey": pub_key}


@router.post("/subscribe")
async def subscribe_push(
    data: PushSubscribeIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inscreve ou atualiza a inscrição do dispositivo do usuário logado."""
    user_agent = request.headers.get("user-agent", "")

    # Check if subscription with this endpoint already exists
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    sub = result.scalar_one_or_none()

    if sub:
        sub.user_id = current_user.id
        sub.p256dh = data.keys.p256dh
        sub.auth = data.keys.auth
        sub.user_agent = user_agent
    else:
        sub = PushSubscription(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            endpoint=data.endpoint,
            p256dh=data.keys.p256dh,
            auth=data.keys.auth,
            user_agent=user_agent,
            created_at=datetime.utcnow(),
        )
        db.add(sub)

    await db.commit()
    return {"ok": True, "subscriptionId": sub.id}


@router.post("/unsubscribe")
async def unsubscribe_push(
    data: PushUnsubscribeIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a inscrição do dispositivo do usuário logado."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == data.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
    return {"ok": True}


@router.post("/test")
async def send_test_push(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Envia uma notificação PUSH de teste para os dispositivos do usuário logado."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    )
    subs = list(result.scalars().all())

    if not subs:
        raise HTTPException(400, "Nenhum dispositivo cadastrado para este usuário.")

    sent = await send_push_payload(
        db=db,
        subscriptions=subs,
        title="🔔 Teste de Notificação",
        body="As notificações PUSH do ApontaMentto estão funcionando perfeitamente!",
        url="/",
        tag="test-notification",
    )

    return {"ok": True, "sentCount": sent}
