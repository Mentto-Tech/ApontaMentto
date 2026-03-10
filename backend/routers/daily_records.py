import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import DailyRecord, User
from schemas import DailyRecordIn, DailyRecordOut

router = APIRouter()


@router.get("", response_model=List[DailyRecordOut])
async def list_daily_records(
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(DailyRecord)

    # Non-admins can only see their own records
    if current_user.role != "admin":
        q = q.where(DailyRecord.user_id == current_user.id)
    elif userId:
        q = q.where(DailyRecord.user_id == userId)

    if date:
        q = q.where(DailyRecord.date == date)
    elif month:
        q = q.where(DailyRecord.date.like(f"{month}%"))

    q = q.order_by(DailyRecord.date)
    result = await db.execute(q)
    return [DailyRecordOut.model_validate(r) for r in result.scalars().all()]


@router.put("", response_model=DailyRecordOut)
async def upsert_daily_record(
    data: DailyRecordIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update a daily record for the given date + current user."""
    result = await db.execute(
        select(DailyRecord).where(
            DailyRecord.date == data.date,
            DailyRecord.user_id == current_user.id,
        )
    )
    record = result.scalar_one_or_none()

    if record:
        record.clock_in = data.clock_in
        record.clock_out = data.clock_out
    else:
        record = DailyRecord(
            id=str(uuid.uuid4()),
            date=data.date,
            clock_in=data.clock_in,
            clock_out=data.clock_out,
            user_id=current_user.id,
            created_at=datetime.utcnow(),
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)
    return DailyRecordOut.model_validate(record)
