from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_admin_user
from models import DailyRecord, PunchLog, TimeBankEntry, User
from routers.daily_records import _auto_overtime_minutes
from schemas import AdminPunchRecordOut, AdminPunchUpdateIn

router = APIRouter()


async def _get_record_with_username(
    db: AsyncSession, record_id: str
) -> tuple[DailyRecord, str] | None:
    result = await db.execute(
        select(DailyRecord, User.username)
        .join(User, User.id == DailyRecord.user_id)
        .where(DailyRecord.id == record_id)
    )
    row = result.first()
    if not row:
        return None
    return row[0], row[1]


@router.get("/punches", response_model=List[AdminPunchRecordOut])
async def list_punches(
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """Lista todos os registros de ponto de todos os usuários (somente admin)."""
    q = select(DailyRecord, User.username).join(User, User.id == DailyRecord.user_id)

    if userId:
        q = q.where(DailyRecord.user_id == userId)
    if date:
        q = q.where(DailyRecord.date == date)
    elif month:
        q = q.where(DailyRecord.date.like(f"{month}%"))

    q = q.order_by(DailyRecord.date.desc(), User.username)
    result = await db.execute(q)

    records: List[AdminPunchRecordOut] = []
    for record, username in result.all():
        out = AdminPunchRecordOut.model_validate(record)
        out.username = username
        records.append(out)
    return records


@router.put("/punches/{record_id}", response_model=AdminPunchRecordOut)
async def update_punch(
    record_id: str,
    data: AdminPunchUpdateIn,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    """Edita manualmente os horários de ponto de um registro (somente admin).

    Ao editar, o registro é marcado como `manually_edited=True`, o cálculo de
    horas extras é refeito automaticamente e as alterações são gravadas no
    PunchLog para auditoria.
    """
    found = await _get_record_with_username(db, record_id)
    if not found:
        raise HTTPException(status_code=404, detail="Registro de ponto não encontrado")
    record, username = found

    fields_set = data.model_fields_set
    if not fields_set:
        raise HTTPException(status_code=400, detail="Nenhum campo para alterar foi enviado.")

    if "in1" in fields_set:
        record.in1 = data.in1
    if "out1" in fields_set:
        record.out1 = data.out1
    if "in2" in fields_set:
        record.in2 = data.in2
    if "out2" in fields_set:
        record.out2 = data.out2
    if "extra_in" in fields_set:
        record.extra_in = data.extra_in
    if "extra_out" in fields_set:
        record.extra_out = data.extra_out
    if "lunch" in fields_set:
        record.lunch = data.lunch

    # Mantém os campos legados clock_in/clock_out alinhados com a folha de ponto
    if record.in1 is not None:
        record.clock_in = record.in1
    if record.out2 is not None:
        record.clock_out = record.out2

    # Hora extra é sempre recalculada automaticamente
    user = await db.get(User, record.user_id)
    category = (
        str(user.category.value) if hasattr(user.category, "value") else str(user.category)
    )
    record.overtime_minutes = _auto_overtime_minutes(
        category=category,
        date_str=record.date,
        in1=record.in1,
        out1=record.out1,
        in2=record.in2,
        out2=record.out2,
        extra_in=record.extra_in,
        extra_out=record.extra_out,
    )

    record.manually_edited = True
    now = datetime.utcnow()
    record.updated_at = now

    # PunchLog para auditoria (uma linha por campo alterado)
    for field in fields_set:
        db.add(
            PunchLog(
                id=str(uuid.uuid4()),
                user_id=record.user_id,
                daily_record_id=record.id,
                date=record.date,
                field=field,
                time_value=getattr(data, field),
                recorded_at=now,
                geo_source="manual_admin",
            )
        )
    db.add(
        PunchLog(
            id=str(uuid.uuid4()),
            user_id=record.user_id,
            daily_record_id=record.id,
            date=record.date,
            field="overtime_minutes",
            overtime_minutes=record.overtime_minutes,
            recorded_at=now,
            geo_source="manual_admin",
        )
    )

    # --- Sync Banco de Horas (mesma regra do fluxo normal de batida) ---
    tb_res = await db.execute(
        select(TimeBankEntry).where(
            TimeBankEntry.daily_record_id == record.id,
            TimeBankEntry.entry_type == "auto",
        )
    )
    tb_entry = tb_res.scalar_one_or_none()

    if (record.overtime_minutes or 0) > 0:
        if tb_entry:
            tb_entry.amount_minutes = record.overtime_minutes
            tb_entry.description = f"Horas extras geradas no dia {record.date}"
        else:
            db.add(
                TimeBankEntry(
                    id=str(uuid.uuid4()),
                    user_id=record.user_id,
                    daily_record_id=record.id,
                    date=record.date,
                    amount_minutes=record.overtime_minutes,
                    description=f"Horas extras geradas no dia {record.date}",
                    entry_type="auto",
                    created_at=datetime.utcnow(),
                )
            )
    else:
        if tb_entry:
            await db.delete(tb_entry)

    await db.commit()
    await db.refresh(record)
    out = AdminPunchRecordOut.model_validate(record)
    out.username = username
    return out
