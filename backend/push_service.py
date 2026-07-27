import json
import os
import logging
import base64
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cryptography.hazmat.primitives.asymmetric.ec import (
    generate_private_key,
    SECP256R1,
    EllipticCurvePrivateKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    PrivateFormat,
    NoEncryption,
)
from cryptography.hazmat.backends import default_backend

from pywebpush import webpush, WebPushException

from models import PushSubscription, Announcement

logger = logging.getLogger(__name__)

# Global cached VAPID keys
_vapid_public_key_b64: Optional[str] = None
_vapid_private_key_pem: Optional[str] = None
_vapid_claim_email: str = os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@apontamentto.com")


def _generate_vapid_keys() -> tuple[str, str]:
    """Generate a new VAPID keypair. Returns (public_key_urlsafe_b64, private_key_pem)."""
    private_key: EllipticCurvePrivateKey = generate_private_key(SECP256R1(), default_backend())

    # Public key as uncompressed point (65 bytes) → URL-safe base64 (no padding)
    pub_bytes = private_key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    pub_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode("utf-8")

    # Private key as PEM for pywebpush
    priv_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()).decode("utf-8")

    return pub_b64, priv_pem


def _get_or_create_vapid() -> tuple[str, str]:
    """Returns (public_key_urlsafe_b64, private_key_pem)."""
    global _vapid_public_key_b64, _vapid_private_key_pem

    if _vapid_public_key_b64 and _vapid_private_key_pem:
        return _vapid_public_key_b64, _vapid_private_key_pem

    pub_env = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    priv_env = os.getenv("VAPID_PRIVATE_KEY", "").strip()

    if pub_env and priv_env:
        _vapid_public_key_b64 = pub_env
        _vapid_private_key_pem = priv_env
        return _vapid_public_key_b64, _vapid_private_key_pem

    # Auto-generate if not provided
    try:
        _vapid_public_key_b64, _vapid_private_key_pem = _generate_vapid_keys()
        logger.warning(
            "VAPID keys auto-generated (ephemeral). Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY "
            "env vars for persistent keys across restarts."
        )
    except Exception as e:
        logger.error(f"Failed to generate VAPID keys: {e}")
        _vapid_public_key_b64 = ""
        _vapid_private_key_pem = ""

    return _vapid_public_key_b64, _vapid_private_key_pem


def get_vapid_public_key() -> str:
    pub_key, _ = _get_or_create_vapid()
    return pub_key


async def send_push_payload(
    db: AsyncSession,
    subscriptions: List[PushSubscription],
    title: str,
    body: str,
    icon: str = "/pwa-192x192.png",
    image: Optional[str] = None,
    url: str = "/",
    tag: Optional[str] = None,
) -> int:
    """Dispara notificação push para uma lista de inscrições.
    Remove automaticamente inscrições expiradas (404/410).
    Retorna o número de envios bem sucedidos.
    """
    pub_key, priv_key_pem = _get_or_create_vapid()
    if not pub_key or not priv_key_pem:
        logger.warning("VAPID keys not configured properly, skipping push notification.")
        return 0

    payload_dict = {
        "title": title,
        "body": body,
        "icon": icon,
        "badge": icon,
        "url": url,
        "tag": tag or "announcement",
    }
    if image:
        payload_dict["image"] = image

    payload_str = json.dumps(payload_dict)
    sent_count = 0
    expired_ids = []

    for sub in subscriptions:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth,
            },
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload_str,
                vapid_private_key=priv_key_pem,
                vapid_claims={"sub": _vapid_claim_email},
                timeout=10,
            )
            sent_count += 1
        except WebPushException as ex:
            logger.warning(f"WebPush error for endpoint {sub.endpoint[:30]}...: {ex}")
            # Status 404 (Not Found) or 410 (Gone) indicates expired/invalid subscription
            if ex.response is not None and ex.response.status_code in (404, 410):
                expired_ids.append(sub.id)
        except Exception as ex:
            logger.error(f"Unexpected error sending web push to {sub.endpoint[:30]}: {ex}")

    if expired_ids:
        # Purge invalid subscriptions
        for sub_id in expired_ids:
            res = await db.execute(select(PushSubscription).where(PushSubscription.id == sub_id))
            obj = res.scalar_one_or_none()
            if obj:
                await db.delete(obj)
        await db.commit()
        logger.info(f"Purged {len(expired_ids)} expired push subscriptions.")

    return sent_count


async def dispatch_announcement_push(db: AsyncSession, announcement: Announcement) -> int:
    """Dispara a notificação PUSH de um aviso para TODOS os dispositivos inscritos."""
    result = await db.execute(select(PushSubscription))
    subscriptions = list(result.scalars().all())

    if not subscriptions:
        logger.info("No active push subscriptions found.")
        return 0

    image_url = None
    if announcement.image_url:
        if announcement.image_url.startswith("http"):
            image_url = announcement.image_url
        else:
            image_url = f"/api/announcements/{announcement.id}/image"

    return await send_push_payload(
        db=db,
        subscriptions=subscriptions,
        title=f"📢 {announcement.title}",
        body=announcement.body,
        image=image_url,
        url="/",
        tag=f"announcement-{announcement.id}",
    )
