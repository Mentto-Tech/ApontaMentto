import asyncio
import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, Query

from dependencies import get_current_user
from models import User

router = APIRouter()

_NOMINATIM_BASE = os.getenv("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org")
_CONTACT = (
    os.getenv("GEOCODER_CONTACT")
    or os.getenv("GEOCODER_CONTACT_EMAIL")
    or os.getenv("ADMIN_EMAIL")
    or ""
).strip()

_DEFAULT_UA = "ApontaMentto/1.0"
if _CONTACT:
    _DEFAULT_UA = f"ApontaMentto/1.0 ({_CONTACT})"

_USER_AGENT = os.getenv("GEOCODER_USER_AGENT", _DEFAULT_UA)
_CACHE_TTL_SECONDS = int(os.getenv("GEOCODER_CACHE_TTL_SECONDS", str(7 * 24 * 60 * 60)))

_IP_GEO_BASE = os.getenv("IP_GEO_BASE_URL", "https://ipwho.is")

# Very small in-memory TTL cache to avoid hammering the geocoding provider.
# key -> (expires_at, payload)
_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}
_cache_lock = asyncio.Lock()


def _cache_key(lat: float, lng: float) -> str:
    return f"{round(lat, 5)}:{round(lng, 5)}"


def _validate_lat_lng(lat: float, lng: float) -> None:
    if not (-90.0 <= lat <= 90.0):
        raise ValueError("lat out of range")
    if not (-180.0 <= lng <= 180.0):
        raise ValueError("lng out of range")


@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(...),
    lng: float = Query(...),
    lang: str = Query("pt-BR"),
    current_user: User = Depends(get_current_user),
):
    """Reverse geocode lat/lng into a human-readable address.

    Note: Requires authentication to reduce abuse.
    """

    # Keep the dependency referenced to enforce auth.
    _ = current_user

    try:
        _validate_lat_lng(lat, lng)
    except ValueError:
        return {"displayName": None}

    key = _cache_key(lat, lng)
    now = time.time()

    async with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

    url = f"{_NOMINATIM_BASE.rstrip('/')}/reverse"
    params = {
        "format": "jsonv2",
        "lat": str(lat),
        "lon": str(lng),
        "addressdetails": "1",
        "accept-language": lang,
    }

    payload: Dict[str, Any] = {"displayName": None}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                params=params,
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json() if resp.content else {}
            payload = {
                "displayName": data.get("display_name"),
                "address": data.get("address"),
            }
    except Exception:
        payload = {"displayName": None}

    async with _cache_lock:
        _cache[key] = (now + _CACHE_TTL_SECONDS, payload)

    return payload


@router.get("/ip")
async def ip_geocode(
    ip: str = Query(..., min_length=3, max_length=64),
    lang: str = Query("pt-BR"),
    current_user: User = Depends(get_current_user),
):
    """Best-effort IP geolocation.

    Note: IP-based geo is approximate (city/region), not an exact address.
    Requires authentication to reduce abuse.
    """

    _ = current_user

    # Cache key separate from lat/lng.
    key = f"ip:{ip.strip()}:{lang.strip()}"
    now = time.time()

    async with _cache_lock:
        cached = _cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

    url = f"{_IP_GEO_BASE.rstrip('/')}/{ip.strip()}"
    params = {"lang": lang}

    payload: Dict[str, Any] = {"displayName": None}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                params=params,
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json() if resp.content else {}

            # ipwho.is returns { success: bool, city, region, country, ... }
            if data.get("success") is False:
                payload = {"displayName": None}
            else:
                city = (data.get("city") or "").strip()
                region = (data.get("region") or "").strip()
                country = (data.get("country") or "").strip()
                parts = [p for p in [city, region, country] if p]
                payload = {
                    "displayName": ", ".join(parts) if parts else None,
                    "raw": data,
                }
    except Exception:
        payload = {"displayName": None}

    async with _cache_lock:
        _cache[key] = (now + _CACHE_TTL_SECONDS, payload)

    return payload
