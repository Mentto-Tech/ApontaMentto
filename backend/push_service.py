import json
import os
import logging
import base64
import time
import struct
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cryptography.hazmat.primitives.asymmetric.ec import (
    generate_private_key,
    SECP256R1,
    EllipticCurvePrivateKey,
    ECDH,
    EllipticCurvePublicKey,
)
from cryptography.hazmat.primitives.asymmetric.ec import derive_private_key as ec_derive_private_key
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    PrivateFormat,
    NoEncryption,
)
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, hmac as crypto_hmac
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
import httpx

from models import PushSubscription, Announcement

logger = logging.getLogger(__name__)

_vapid_public_key_b64: Optional[str] = None
_vapid_private_key_b64: Optional[str] = None
_vapid_claim_email: str = os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@apontamentto.com")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _b64u_encode(data: bytes) -> str:
    """URL-safe base64 without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64u_decode(s: str) -> bytes:
    """URL-safe base64 decode, handles missing padding."""
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _load_private_key(b64url: str) -> EllipticCurvePrivateKey:
    """Load an EC private key from a base64url-encoded raw 32-byte scalar."""
    raw = _b64u_decode(b64url)
    # raw scalar → integer
    private_value = int.from_bytes(raw, "big")
    return ec_derive_private_key(private_value, SECP256R1(), default_backend())


# ---------------------------------------------------------------------------
# VAPID key management
# ---------------------------------------------------------------------------

def _get_or_create_vapid() -> tuple[str, str]:
    """Returns (public_key_urlsafe_b64_uncompressed, private_key_urlsafe_b64_raw)."""
    global _vapid_public_key_b64, _vapid_private_key_b64

    if _vapid_public_key_b64 and _vapid_private_key_b64:
        return _vapid_public_key_b64, _vapid_private_key_b64

    pub_env = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    priv_env = os.getenv("VAPID_PRIVATE_KEY", "").strip()

    if pub_env and priv_env:
        _vapid_public_key_b64 = pub_env
        _vapid_private_key_b64 = priv_env
        return _vapid_public_key_b64, _vapid_private_key_b64

    # Auto-generate ephemeral keypair
    try:
        priv_key: EllipticCurvePrivateKey = generate_private_key(SECP256R1(), default_backend())

        pub_bytes = priv_key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        _vapid_public_key_b64 = _b64u_encode(pub_bytes)

        priv_int = priv_key.private_numbers().private_value
        _vapid_private_key_b64 = _b64u_encode(priv_int.to_bytes(32, "big"))

        logger.warning(
            "VAPID keys auto-generated (ephemeral). Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY "
            "env vars for persistent keys across restarts."
        )
    except Exception as e:
        logger.error(f"Failed to generate VAPID keys: {e}")
        _vapid_public_key_b64 = ""
        _vapid_private_key_b64 = ""

    return _vapid_public_key_b64, _vapid_private_key_b64


def get_vapid_public_key() -> str:
    pub_key, _ = _get_or_create_vapid()
    return pub_key


# ---------------------------------------------------------------------------
# VAPID JWT
# ---------------------------------------------------------------------------

def _make_vapid_jwt(audience: str, subject: str, priv_key: EllipticCurvePrivateKey) -> str:
    """Build and sign a minimal VAPID JWT."""
    header = _b64u_encode(json.dumps({"typ": "JWT", "alg": "ES256"}).encode())
    payload = _b64u_encode(json.dumps({
        "aud": audience,
        "exp": int(time.time()) + 43200,  # 12 hours
        "sub": subject,
    }).encode())
    signing_input = f"{header}.{payload}".encode()

    # Sign
    der_sig = priv_key.sign(signing_input, ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_sig)
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")

    return f"{header}.{payload}.{_b64u_encode(raw_sig)}"


# ---------------------------------------------------------------------------
# RFC 8188 aes128gcm encryption (Web Push)
# ---------------------------------------------------------------------------

def _hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    h = crypto_hmac.HMAC(salt, hashes.SHA256(), backend=default_backend())
    h.update(ikm)
    return h.finalize()


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    output = b""
    t = b""
    counter = 1
    while len(output) < length:
        h = crypto_hmac.HMAC(prk, hashes.SHA256(), backend=default_backend())
        h.update(t + info + bytes([counter]))
        t = h.finalize()
        output += t
        counter += 1
    return output[:length]


def _encrypt_payload(data: bytes, p256dh_b64: str, auth_b64: str) -> tuple[bytes, bytes]:
    """
    Encrypt `data` using RFC 8188 aes128gcm for Web Push.
    Returns (salt, ciphertext_with_header).
    """
    # Decode receiver public key and auth secret
    receiver_pub_bytes = _b64u_decode(p256dh_b64)
    auth_secret = _b64u_decode(auth_b64)

    # Load receiver public key
    from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey
    from cryptography.hazmat.primitives.serialization import load_der_public_key
    receiver_pub: EllipticCurvePublicKey = EllipticCurvePublicKey.from_encoded_point(
        SECP256R1(), receiver_pub_bytes
    )

    # Generate ephemeral sender keypair
    sender_priv: EllipticCurvePrivateKey = generate_private_key(SECP256R1(), default_backend())
    sender_pub_bytes = sender_priv.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)

    # ECDH shared secret
    shared_secret = sender_priv.exchange(ECDH(), receiver_pub)

    # salt (16 random bytes)
    salt = os.urandom(16)

    # PRK_key = HKDF-Extract(auth_secret, shared_secret)  [with "WebPush: info\x00" label]
    prk_key = _hkdf_extract(auth_secret, shared_secret)

    key_info = b"WebPush: info\x00" + receiver_pub_bytes + sender_pub_bytes
    ikm = _hkdf_expand(prk_key, key_info, 32)

    # Derive content encryption key and nonce
    prk = _hkdf_extract(salt, ikm)
    content_key = _hkdf_expand(prk, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf_expand(prk, b"Content-Encoding: nonce\x00", 12)

    # Pad: single record (data + \x02 delimiter, no padding)
    plaintext = data + b"\x02"

    aesgcm = AESGCM(content_key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # Build RFC 8188 header: salt(16) + rs(4, big-endian) + idlen(1) + keyid(sender pub, 65 bytes)
    rs = len(plaintext) + 16  # record size = plaintext + GCM tag
    header = salt + struct.pack(">I", rs) + bytes([len(sender_pub_bytes)]) + sender_pub_bytes

    return salt, header + ciphertext


# ---------------------------------------------------------------------------
# Send a single push notification
# ---------------------------------------------------------------------------

async def _send_one(
    sub: PushSubscription,
    payload_bytes: bytes,
    vapid_jwt: str,
    vapid_pub_b64: str,
) -> bool:
    """
    Send an encrypted Web Push to a single subscription endpoint.
    Returns True on success, False on permanent failure (404/410).
    Raises on transient errors.
    """
    salt, encrypted = _encrypt_payload(payload_bytes, sub.p256dh, sub.auth)

    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        # RFC 8292: space after comma is required; some push services are strict about it
        "Authorization": f"vapid t={vapid_jwt}, k={vapid_pub_b64}",
        "TTL": "86400",
        "Urgency": "normal",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(sub.endpoint, content=encrypted, headers=headers)

    if resp.status_code in (200, 201, 202):
        return True
    if resp.status_code in (404, 410):
        logger.warning(f"Subscription expired ({resp.status_code}): {sub.endpoint[:60]}")
        return False
    # Log unexpected errors to help diagnose
    logger.error(
        f"Push failed for {sub.endpoint[:60]} — HTTP {resp.status_code}: {resp.text[:200]}"
    )
    resp.raise_for_status()
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

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
    pub_b64, priv_b64 = _get_or_create_vapid()
    if not pub_b64 or not priv_b64:
        logger.warning("VAPID keys not configured, skipping push notification.")
        return 0

    priv_key = _load_private_key(priv_b64)

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
    payload_bytes = json.dumps(payload_dict).encode("utf-8")

    sent_count = 0
    expired_ids = []

    for sub in subscriptions:
        try:
            # Build VAPID JWT audience from endpoint origin
            from urllib.parse import urlparse
            parsed = urlparse(sub.endpoint)
            audience = f"{parsed.scheme}://{parsed.netloc}"
            jwt = _make_vapid_jwt(audience, _vapid_claim_email, priv_key)

            ok = await _send_one(sub, payload_bytes, jwt, pub_b64)
            if ok:
                sent_count += 1
            else:
                expired_ids.append(sub.id)
        except Exception as ex:
            logger.error(f"Error sending push to {sub.endpoint[:50]}: {ex}")

    if expired_ids:
        for sub_id in expired_ids:
            res = await db.execute(select(PushSubscription).where(PushSubscription.id == sub_id))
            obj = res.scalar_one_or_none()
            if obj:
                await db.delete(obj)
        await db.commit()
        logger.info(f"Purged {len(expired_ids)} expired push subscriptions.")

    return sent_count
