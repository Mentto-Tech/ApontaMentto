import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import TimeEntry, User
from schemas import TimeEntryIn, TimeEntryOut

router = APIRouter()


@router.get("", response_model=List[TimeEntryOut])
async def list_entries(
    date: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(TimeEntry)

    # Non-admins can only see their own entries
    if current_user.role != "admin":
        q = q.where(TimeEntry.user_id == current_user.id)
    elif userId:
        q = q.where(TimeEntry.user_id == userId)

    if date:
        q = q.where(TimeEntry.date == date)
    elif month:
        q = q.where(TimeEntry.date.like(f"{month}%"))

    q = q.order_by(TimeEntry.date, TimeEntry.start_time)
    result = await db.execute(q)
    return [TimeEntryOut.model_validate(e) for e in result.scalars().all()]


@router.post("", response_model=TimeEntryOut)
async def create_entry(
    data: TimeEntryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = TimeEntry(
        id=str(uuid.uuid4()),
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        project_id=data.project_id,
        location_id=data.location_id,
        notes=data.notes,
        user_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TimeEntryOut.model_validate(entry)


@router.put("/{entry_id}", response_model=TimeEntryOut)
async def update_entry(
    entry_id: str,
    data: TimeEntryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TimeEntry).where(TimeEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Registro não encontrado")
    if entry.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    entry.date = data.date
    entry.start_time = data.start_time
    entry.end_time = data.end_time
    entry.project_id = data.project_id
    entry.location_id = data.location_id
    entry.notes = data.notes
    await db.commit()
    await db.refresh(entry)
    return TimeEntryOut.model_validate(entry)


@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TimeEntry).where(TimeEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Registro não encontrado")
    if entry.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Sem permissão")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}
