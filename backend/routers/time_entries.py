import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import TimeEntry, TimeBankEntry, User
from schemas import TimeEntryIn, TimeEntryOut

router = APIRouter()


def _calc_mins(start: str, end: str) -> int:
    sh, sm = map(int, start.split(":"))
    eh, em = map(int, end.split(":"))
    diff = (eh * 60 + em) - (sh * 60 + sm)
    return max(0, diff)


async def _sync_time_bank_for_day(user_id: str, date: str, db: AsyncSession):
    """Recalcula o total de minutos de overtime do usuário no dia e faz upsert na TimeBankEntry."""
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user_id,
            TimeEntry.date == date,
            TimeEntry.is_overtime == True,
            TimeEntry.entry_type != "break",
        )
    )
    overtime_entries = result.scalars().all()
    total_minutes = sum(_calc_mins(e.start_time, e.end_time) for e in overtime_entries)

    tb_res = await db.execute(
        select(TimeBankEntry).where(
            TimeBankEntry.user_id == user_id,
            TimeBankEntry.date == date,
            TimeBankEntry.entry_type == "auto",
            TimeBankEntry.daily_record_id == None,
        )
    )
    tb_entry = tb_res.scalar_one_or_none()

    if total_minutes > 0:
        if tb_entry:
            tb_entry.amount_minutes = total_minutes
            tb_entry.description = "Hora extra"
        else:
            db.add(TimeBankEntry(
                id=str(uuid.uuid4()),
                user_id=user_id,
                daily_record_id=None,
                date=date,
                amount_minutes=total_minutes,
                description="Hora extra",
                entry_type="auto",
                created_at=datetime.utcnow(),
            ))
    else:
        if tb_entry:
            await db.delete(tb_entry)


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
        project_id=data.project_id or None,
        location_id=data.location_id or None,
        notes=data.notes,
        entry_type=data.entry_type,
        is_overtime=data.is_overtime,
        user_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    await db.flush()

    if data.is_overtime and data.entry_type != "break":
        await _sync_time_bank_for_day(current_user.id, data.date, db)

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

    old_date = entry.date
    old_is_overtime = entry.is_overtime

    entry.date = data.date
    entry.start_time = data.start_time
    entry.end_time = data.end_time
    entry.project_id = data.project_id or None
    entry.location_id = data.location_id or None
    entry.notes = data.notes
    entry.entry_type = data.entry_type
    entry.is_overtime = data.is_overtime

    await db.flush()

    # Sync for old date if it changed or overtime flag changed
    if old_is_overtime or data.is_overtime:
        await _sync_time_bank_for_day(entry.user_id, data.date, db)
        if old_date != data.date and old_is_overtime:
            await _sync_time_bank_for_day(entry.user_id, old_date, db)

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

    was_overtime = entry.is_overtime
    entry_date = entry.date
    entry_user_id = entry.user_id

    await db.delete(entry)
    await db.flush()

    if was_overtime:
        await _sync_time_bank_for_day(entry_user_id, entry_date, db)

    await db.commit()
    return {"ok": True}
