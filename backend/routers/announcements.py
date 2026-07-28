import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Announcement, AnnouncementTarget, User
from schemas import AnnouncementIn, AnnouncementOut, CamelModel
from storage_service import S3Storage, build_announcement_image_s3_key
from push_service import send_push_payload, dispatch_announcement_push

router = APIRouter()
_storage = S3Storage()


class PushScheduleIn(CamelModel):
    interval_minutes: Optional[int] = None
    repeat_until: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ann_out(ann: Announcement) -> AnnouncementOut:
    """Build AnnouncementOut including target_user_ids from loaded relationship."""
    data = AnnouncementOut.model_validate(ann)
    data.target_user_ids = [t.user_id for t in (ann.targets or [])]
    return data


async def _set_targets(db: AsyncSession, ann: Announcement, target_all: bool, user_ids: List[str]):
    """Replace the target list for an announcement."""
    ann.target_all = target_all
    # Delete existing targets
    existing = await db.execute(
        select(AnnouncementTarget).where(AnnouncementTarget.announcement_id == ann.id)
    )
    for t in existing.scalars().all():
        await db.delete(t)
    # Add new ones
    if not target_all:
        for uid in set(user_ids):
            db.add(AnnouncementTarget(announcement_id=ann.id, user_id=uid))


def _user_can_see(ann: Announcement, user_id: str) -> bool:
    """Return True if this user should see the announcement."""
    if ann.target_all:
        return True
    return any(t.user_id == user_id for t in (ann.targets or []))


async def _get_subscriptions_for_announcement(db: AsyncSession, ann: Announcement):
    """Return PushSubscription list scoped to announcement targets."""
    from models import PushSubscription
    if ann.target_all:
        result = await db.execute(select(PushSubscription))
        return list(result.scalars().all())
    else:
        target_ids = [t.user_id for t in (ann.targets or [])]
        if not target_ids:
            return []
        from sqlalchemy import and_
        result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id.in_(target_ids))
        )
        return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=List[AnnouncementOut])
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admins see all; regular users see only their own announcements."""
    if current_user.role == "admin":
        result = await db.execute(
            select(Announcement)
            .options(selectinload(Announcement.targets))
            .order_by(Announcement.created_at.desc())
        )
        return [_ann_out(a) for a in result.scalars().all()]
    else:
        # User sees announcements they created OR that target them (target_all or listed)
        result = await db.execute(
            select(Announcement)
            .options(selectinload(Announcement.targets))
            .where(
                or_(
                    Announcement.created_by_id == current_user.id,
                    Announcement.target_all == True,
                    Announcement.targets.any(AnnouncementTarget.user_id == current_user.id),
                )
            )
            .order_by(Announcement.created_at.desc())
        )
        return [_ann_out(a) for a in result.scalars().all()]


@router.get("/active", response_model=AnnouncementOut | None)
async def get_active_announcement(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns the active announcement visible to the current user."""
    result = await db.execute(
        select(Announcement)
        .options(selectinload(Announcement.targets))
        .where(Announcement.is_active == True)
        .order_by(Announcement.activated_at.desc())
    )
    for ann in result.scalars().all():
        if _user_can_see(ann, current_user.id):
            return _ann_out(ann)
    return None


@router.post("", response_model=AnnouncementOut)
async def create_announcement(
    data: AnnouncementIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Non-admins always create for themselves only
    if current_user.role != "admin":
        target_all = False
        target_user_ids = [current_user.id]
    else:
        target_all = data.target_all
        target_user_ids = data.target_user_ids

    ann = Announcement(
        id=str(uuid.uuid4()),
        title=data.title,
        body=data.body,
        image_url=data.image_url,
        is_active=False,
        created_by_id=current_user.id,
        created_at=datetime.utcnow(),
        target_all=target_all,
        push_repeat_interval_minutes=data.push_repeat_interval_minutes,
        push_repeat_until=data.push_repeat_until.replace(tzinfo=None) if data.push_repeat_until else None,
    )
    db.add(ann)
    await db.flush()  # get ann.id before adding targets
    await _set_targets(db, ann, target_all, target_user_ids)
    await db.commit()
    await db.refresh(ann)
    # Reload with targets
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == ann.id)
    )
    return _ann_out(result.scalar_one())


@router.put("/{announcement_id}", response_model=AnnouncementOut)
async def update_announcement(
    announcement_id: str,
    data: AnnouncementIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    # Only creator or admin can edit
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")

    ann.title = data.title
    ann.body = data.body
    ann.push_repeat_interval_minutes = data.push_repeat_interval_minutes
    ann.push_repeat_until = data.push_repeat_until.replace(tzinfo=None) if data.push_repeat_until else None

    # Update targets (non-admin can only target themselves)
    if current_user.role == "admin":
        await _set_targets(db, ann, data.target_all, data.target_user_ids)
    else:
        await _set_targets(db, ann, False, [current_user.id])

    # Image handling
    if data.image_url and (
        data.image_url.startswith("/api/announcements/") or data.image_url == ann.image_url
    ):
        pass
    else:
        if ann.image_url and ann.image_url != data.image_url:
            bucket = _storage.config.bucket
            is_external = ann.image_url.startswith("http") and not (bucket and bucket in ann.image_url)
            if not is_external:
                try:
                    key_to_delete = ann.image_url
                    if ann.image_url.startswith("http"):
                        from urllib.parse import urlparse
                        parsed = urlparse(ann.image_url)
                        path = parsed.path.lstrip("/")
                        if bucket and path.startswith(bucket + "/"):
                            key_to_delete = path[len(bucket) + 1:]
                        else:
                            key_to_delete = path
                    _storage.delete_object(key_to_delete)
                except Exception:
                    pass
        ann.image_url = data.image_url

    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == ann.id)
    )
    return _ann_out(result.scalar_one())


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")

    if ann.image_url:
        bucket = _storage.config.bucket
        is_external = ann.image_url.startswith("http") and not (bucket and bucket in ann.image_url)
        if not is_external:
            try:
                key_to_delete = ann.image_url
                if ann.image_url.startswith("http"):
                    from urllib.parse import urlparse
                    parsed = urlparse(ann.image_url)
                    path = parsed.path.lstrip("/")
                    if bucket and path.startswith(bucket + "/"):
                        key_to_delete = path[len(bucket) + 1:]
                    else:
                        key_to_delete = path
                _storage.delete_object(key_to_delete)
            except Exception:
                pass

    await db.delete(ann)
    await db.commit()
    return {"ok": True}


@router.post("/{announcement_id}/upload-image")
async def upload_announcement_image(
    announcement_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")
    if not _storage.enabled:
        raise HTTPException(503, "Armazenamento S3 não configurado")

    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Tipo de arquivo não permitido. Use JPEG, PNG, GIF ou WebP.")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande (máx 10 MB)")

    if ann.image_url and not ann.image_url.startswith("http"):
        try:
            _storage.delete_object(ann.image_url)
        except Exception:
            pass

    key = build_announcement_image_s3_key(announcement_id=announcement_id, original_filename=file.filename)
    _storage.upload_bytes(key, data, content_type=file.content_type)
    ann.image_url = key
    await db.commit()
    return {"imageUrl": f"/api/announcements/{announcement_id}/image"}


@router.get("/{announcement_id}/image")
async def serve_announcement_image(announcement_id: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import Response as FastAPIResponse
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann or not ann.image_url:
        raise HTTPException(404, "Imagem não encontrada")

    bucket = _storage.config.bucket
    is_internal_s3 = ann.image_url.startswith("http") and bucket and bucket in ann.image_url

    if ann.image_url.startswith("http") and not is_internal_s3:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(ann.image_url)

    if not _storage.enabled:
        raise HTTPException(503, "Armazenamento S3 não configurado")

    try:
        s3_key = ann.image_url
        if is_internal_s3:
            from urllib.parse import urlparse
            parsed = urlparse(ann.image_url)
            path = parsed.path.lstrip("/")
            s3_key = path[len(bucket) + 1:] if bucket and path.startswith(bucket + "/") else path
        data, content_type = _storage.download_bytes(s3_key)
    except Exception:
        raise HTTPException(404, "Imagem não encontrada no S3")

    return FastAPIResponse(content=data, media_type=content_type or "image/jpeg")


@router.post("/{announcement_id}/activate", response_model=AnnouncementOut)
async def activate_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Deactivate conflicting active announcements (only those that target same users)
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")

    ann.is_active = True
    ann.activated_at = datetime.utcnow()
    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == ann.id)
    )
    return _ann_out(result.scalar_one())


@router.post("/{announcement_id}/deactivate", response_model=AnnouncementOut)
async def deactivate_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")
    ann.is_active = False
    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == ann.id)
    )
    return _ann_out(result.scalar_one())


@router.post("/{announcement_id}/schedule", response_model=AnnouncementOut)
async def schedule_announcement_push(
    announcement_id: str,
    data: PushScheduleIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")
    if data.interval_minutes is not None and data.interval_minutes < 1:
        raise HTTPException(400, "Intervalo deve ser de pelo menos 1 minuto")

    ann.push_repeat_interval_minutes = data.interval_minutes
    ann.push_repeat_until = data.repeat_until.replace(tzinfo=None) if data.repeat_until else None
    if data.interval_minutes:
        ann.push_last_sent_at = None
    await db.commit()
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == ann.id)
    )
    return _ann_out(result.scalar_one())


@router.post("/{announcement_id}/push")
async def trigger_announcement_push(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger push for an announcement, scoped to its targets."""
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.targets)).where(Announcement.id == announcement_id)
    )
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    if current_user.role != "admin" and ann.created_by_id != current_user.id:
        raise HTTPException(403, "Sem permissão")

    subscriptions = await _get_subscriptions_for_announcement(db, ann)
    sent = await send_push_payload(
        db=db,
        subscriptions=subscriptions,
        title=f"📢 {ann.title}",
        body=ann.body,
        url="/",
        tag=f"announcement-{ann.id}",
    )
    return {"ok": True, "sentCount": sent}
