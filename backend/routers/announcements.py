import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Announcement, User
from schemas import AnnouncementIn, AnnouncementOut
from storage_service import S3Storage, build_announcement_image_s3_key

router = APIRouter()
_storage = S3Storage()


@router.get("", response_model=List[AnnouncementOut])
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()))
    return [AnnouncementOut.model_validate(a) for a in result.scalars().all()]


@router.get("/active", response_model=AnnouncementOut | None)
async def get_active_announcement(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns the currently active announcement (any authenticated user)."""
    result = await db.execute(
        select(Announcement).where(Announcement.is_active == True).limit(1)
    )
    ann = result.scalar_one_or_none()
    if ann is None:
        return None
    return AnnouncementOut.model_validate(ann)


@router.post("", response_model=AnnouncementOut)
async def create_announcement(
    data: AnnouncementIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    ann = Announcement(
        id=str(uuid.uuid4()),
        title=data.title,
        body=data.body,
        image_url=data.image_url,
        is_active=False,
        created_by_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@router.put("/{announcement_id}", response_model=AnnouncementOut)
async def update_announcement(
    announcement_id: str,
    data: AnnouncementIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    ann.title = data.title
    ann.body = data.body
    
    # If image_url points to our local proxy for this announcement, keep the current stored value
    if data.image_url and (
        data.image_url.startswith("/api/announcements/") or 
        data.image_url == ann.image_url
    ):
        pass
    else:
        # Delete old image if it changes
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
                            key_to_delete = path[len(bucket) + 1 :]
                        else:
                            key_to_delete = path
                    _storage.delete_object(key_to_delete)
                except Exception:
                    pass
        ann.image_url = data.image_url

    await db.commit()
    await db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
        
    # Also delete image if exists on S3
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
                        key_to_delete = path[len(bucket) + 1 :]
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
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")

    if not _storage.enabled:
        raise HTTPException(503, "Armazenamento S3 não configurado")

    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Tipo de arquivo não permitido. Use JPEG, PNG, GIF ou WebP.")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande (máx 10 MB)")

    # Delete old image if exists
    if ann.image_url and not ann.image_url.startswith("http"):
        try:
            _storage.delete_object(ann.image_url)
        except Exception:
            pass

    key = build_announcement_image_s3_key(
        announcement_id=announcement_id,
        original_filename=file.filename,
    )
    _storage.upload_bytes(key, data, content_type=file.content_type)

    # Store the S3 key (not a public URL — served via /image endpoint)
    ann.image_url = key
    await db.commit()
    await db.refresh(ann)
    return {"imageUrl": f"/api/announcements/{announcement_id}/image"}


@router.get("/{announcement_id}/image")
async def serve_announcement_image(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from fastapi.responses import Response as FastAPIResponse
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann or not ann.image_url:
        raise HTTPException(404, "Imagem não encontrada")

    # If it's an external URL (NOT in our S3 bucket), just redirect to it
    bucket = _storage.config.bucket
    is_internal_s3 = False
    if ann.image_url.startswith("http") and bucket and bucket in ann.image_url:
        is_internal_s3 = True

    if ann.image_url.startswith("http") and not is_internal_s3:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(ann.image_url)

    if not _storage.enabled:
        raise HTTPException(503, "Armazenamento S3 não configurado")

    try:
        # If it's an internal S3 URL, extract the key, otherwise use the key directly
        s3_key = ann.image_url
        if is_internal_s3:
            from urllib.parse import urlparse
            parsed = urlparse(ann.image_url)
            path = parsed.path.lstrip("/")
            if bucket and path.startswith(bucket + "/"):
                s3_key = path[len(bucket) + 1 :]
            else:
                s3_key = path
                
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
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    # Deactivate all others first
    all_result = await db.execute(select(Announcement).where(Announcement.is_active == True))
    for a in all_result.scalars().all():
        a.is_active = False
    # Activate the chosen one
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    ann.is_active = True
    ann.activated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(ann)
    return AnnouncementOut.model_validate(ann)


@router.post("/{announcement_id}/deactivate", response_model=AnnouncementOut)
async def deactivate_announcement(
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Aviso não encontrado")
    ann.is_active = False
    await db.commit()
    await db.refresh(ann)
    return AnnouncementOut.model_validate(ann)
