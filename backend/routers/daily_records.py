import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import DailyRecord, User
from schemas import DailyRecordIn, DailyRecordOut

router = APIRouter()


def _extract_client_ip(request: Request) -> Optional[str]:
    # Prefer proxy headers (Render/Nginx) when present
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Can be a list: client, proxy1, proxy2
        return xff.split(",")[0].strip() or None
    forwarded = request.headers.get("forwarded")
    if forwarded and "for=" in forwarded:
        # Very small parser; handles: for=1.2.3.4
        try:
            part = forwarded.split("for=")[1].split(";")[0].strip().strip('"')
            return part or None
        except Exception:
            return None
    return request.client.host if request.client else None


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
    request: Request,
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

    # Map legacy fields ↔ new folha fields
    in1 = data.in1 if data.in1 is not None else data.clock_in
    out2 = data.out2 if data.out2 is not None else data.clock_out
    clock_in = data.clock_in if data.clock_in is not None else data.in1
    clock_out = data.clock_out if data.clock_out is not None else data.out2

    ip_address = _extract_client_ip(request)
    user_agent = request.headers.get("user-agent")
    now = datetime.utcnow()

    if record:
        record.clock_in = clock_in
        record.clock_out = clock_out

        record.in1 = in1
        record.out1 = data.out1
        record.in2 = data.in2
        record.out2 = out2
        record.overtime_minutes = data.overtime_minutes

        # Always capture request metadata
        record.ip_address = ip_address
        record.user_agent = user_agent
        record.updated_at = now

        # Device geolocation (only overwrite when provided)
        if data.geo_lat is not None and data.geo_lng is not None:
            record.geo_lat = data.geo_lat
            record.geo_lng = data.geo_lng
            record.geo_accuracy = data.geo_accuracy
            record.geo_source = data.geo_source or "device"
        elif record.geo_lat is None and record.geo_lng is None:
            record.geo_source = record.geo_source or "ip"
    else:
        record = DailyRecord(
            id=str(uuid.uuid4()),
            date=data.date,
            clock_in=clock_in,
            clock_out=clock_out,

            in1=in1,
            out1=data.out1,
            in2=data.in2,
            out2=out2,
            overtime_minutes=data.overtime_minutes,

            geo_lat=data.geo_lat,
            geo_lng=data.geo_lng,
            geo_accuracy=data.geo_accuracy,
            geo_source=(data.geo_source or ("device" if data.geo_lat is not None and data.geo_lng is not None else "ip")),
            ip_address=ip_address,
            user_agent=user_agent,
            updated_at=now,
            user_id=current_user.id,
            created_at=datetime.utcnow(),
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)
    return DailyRecordOut.model_validate(record)
