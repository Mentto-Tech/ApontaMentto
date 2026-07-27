import json
import os
import logging
import inspect
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from cryptography.hazmat.primitives.asymmetric import ec

# Patch cryptography functions to convert uninstantiated curve classes (passed by py_vapid) into instances
_orig_epn_init = ec.EllipticPublicNumbers.__init__
def _patched_epn_init(self, x, y, curve):
    if inspect.isclass(curve) and issubclass(curve, ec.EllipticCurve):
        curve = curve()
    _orig_epn_init(self, x, y, curve)
ec.EllipticPublicNumbers.__init__ = _patched_epn_init

_orig_generate_private_key = ec.generate_private_key
def _patched_generate_private_key(curve, backend=None):
    if inspect.isclass(curve) and issubclass(curve, ec.EllipticCurve):
        curve = curve()
    return _orig_generate_private_key(curve, backend=backend)
ec.generate_private_key = _patched_generate_private_key

_orig_derive_private_key = ec.derive_private_key
def _patched_derive_private_key(private_value, curve, backend=None):
    if inspect.isclass(curve) and issubclass(curve, ec.EllipticCurve):
        curve = curve()
    return _orig_derive_private_key(private_value, curve, backend=backend)
ec.derive_private_key = _patched_derive_private_key

from pywebpush import webpush, WebPushException
from py_vapid import Vapid

from models import PushSubscription, Announcement

logger = logging.getLogger(__name__)

# Global cached VAPID instance and claims
_vapid_instance: Optional[Vapid] = None
_vapid_public_key_b64: Optional[str] = None
_vapid_private_key: Optional[str] = None
_vapid_claim_email: str = os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@apontamentto.com")


def _get_or_create_vapid() -> tuple[str, str]:
    global _vapid_public_key_b64, _vapid_private_key, _vapid_instance

    if _vapid_public_key_b64 and _vapid_private_key:
        return _vapid_public_key_b64, _vapid_private_key

    pub_env = os.getenv("VAPID_PUBLIC_KEY")
    priv_env = os.getenv("VAPID_PRIVATE_KEY")

    if pub_env and priv_env:
        _vapid_public_key_b64 = pub_env.strip()
        _vapid_private_key = priv_env.strip()
        return _vapid_public_key_b64, _vapid_private_key

    # Generate keypair automatically if not supplied in env
    try:
        vapid = Vapid()
        vapid.generate_keys()
        _vapid_instance = vapid

        if hasattr(vapid.public_key, "savePublicKey"):
            _vapid_public_key_b64 = vapid.public_key.savePublicKey().decode("utf-8")
        elif isinstance(vapid.public_key, bytes):
            _vapid_public_key_b64 = vapid.public_key.decode("utf-8")
        else:
            _vapid_public_key_b64 = str(vapid.public_key)

        if hasattr(vapid.private_key, "savePrivateKey"):
            _vapid_private_key = vapid.private_key.savePrivateKey().decode("utf-8")
        elif isinstance(vapid.private_key, bytes):
            _vapid_private_key = vapid.private_key.decode("utf-8")
        else:
            _vapid_private_key = str(vapid.private_key)

        logger.info("VAPID keys auto-generated successfully.")
    except Exception as e:
        logger.error(f"Failed to generate VAPID keys: {e}")
        _vapid_public_key_b64 = pub_env or ""
        _vapid_private_key = priv_env or ""

    return _vapid_public_key_b64, _vapid_private_key


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
    pub_key, priv_key = _get_or_create_vapid()
    if not pub_key or not priv_key:
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
                vapid_private_key=priv_key,
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
