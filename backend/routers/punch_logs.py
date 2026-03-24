from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import PunchLog, User
from schemas import PunchLogOut

router = APIRouter()


@router.get("", response_model=List[PunchLogOut])
async def list_punch_logs(
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(PunchLog)

    if current_user.role != "admin":
        q = q.where(PunchLog.user_id == current_user.id)
    elif userId:
        q = q.where(PunchLog.user_id == userId)

    if date:
        q = q.where(PunchLog.date == date)
    elif month:
        q = q.where(PunchLog.date.like(f"{month}%"))

    q = q.order_by(PunchLog.recorded_at.desc()).limit(limit)
    result = await db.execute(q)
    return [PunchLogOut.model_validate(r) for r in result.scalars().all()]
