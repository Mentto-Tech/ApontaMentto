import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Announcement, User
from schemas import AnnouncementIn, AnnouncementOut

router = APIRouter()


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
    await db.delete(ann)
    await db.commit()
    return {"ok": True}


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
