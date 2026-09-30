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
from schemas import AdminDailyRecordIn, AdminPunchRecordOut, AdminPunchUpdateIn, DailyRecordOut

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
    if "in1" in fields_set:
        record.clock_in = data.in1
    if "out2" in fields_set:
        record.clock_out = data.out2

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


@router.put("/daily-records", response_model=DailyRecordOut)
async def admin_upsert_daily_record(
    data: AdminDailyRecordIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    """
    Cria ou atualiza o registro de ponto de qualquer usuário (somente admin / service account).

    Idêntico ao PUT /api/daily-records mas sem a restrição de `current_user` —
    o `userId` alvo é informado explicitamente no body.
    Usado pelo SSI para bater ponto em nome do funcionário.
    """
    # Valida que o usuário alvo existe
    target_user = await db.get(User, data.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"Usuário {data.user_id} não encontrado.")

    result = await db.execute(
        select(DailyRecord).where(
            DailyRecord.date == data.date,
            DailyRecord.user_id == data.user_id,
        )
    )
    record = result.scalar_one_or_none()

    fields_set = set(data.model_fields_set) - {"user_id"}

    # Mescla com valores existentes (mesma lógica do endpoint normal)
    existing_in1 = record.in1 if record else None
    existing_out1 = record.out1 if record else None
    existing_in2 = record.in2 if record else None
    existing_out2 = record.out2 if record else None
    existing_extra_in = record.extra_in if record else None
    existing_extra_out = record.extra_out if record else None

    incoming_in1 = data.in1 if "in1" in fields_set else (data.clock_in if "clock_in" in fields_set else None)
    incoming_out2 = data.out2 if "out2" in fields_set else (data.clock_out if "clock_out" in fields_set else None)

    cand_in1 = incoming_in1 if incoming_in1 is not None else existing_in1
    cand_out1 = data.out1 if "out1" in fields_set else existing_out1
    cand_in2 = data.in2 if "in2" in fields_set else existing_in2
    cand_out2 = incoming_out2 if incoming_out2 is not None else existing_out2
    cand_extra_in = data.extra_in if "extra_in" in fields_set else existing_extra_in
    cand_extra_out = data.extra_out if "extra_out" in fields_set else existing_extra_out
    cand_lunch = data.lunch if "lunch" in fields_set else (record.lunch if record else None)

    category = (
        str(target_user.category.value)
        if hasattr(target_user.category, "value")
        else str(target_user.category)
    )
    cand_ot = _auto_overtime_minutes(
        category=category,
        date_str=data.date,
        in1=cand_in1,
        out1=cand_out1,
        in2=cand_in2,
        out2=cand_out2,
        extra_in=cand_extra_in,
        extra_out=cand_extra_out,
    )

    cand_clock_in = incoming_in1 if incoming_in1 is not None else (record.clock_in if record else None)
    cand_clock_out = incoming_out2 if incoming_out2 is not None else (record.clock_out if record else None)

    now = datetime.utcnow()

    def _log(field: str, *, time_value=None, overtime_minutes=None, record_id=None):
        db.add(PunchLog(
            id=str(uuid.uuid4()),
            user_id=data.user_id,
            daily_record_id=record_id,
            date=data.date,
            field=field,
            time_value=time_value,
            overtime_minutes=overtime_minutes,
            recorded_at=now,
            geo_source="service_account",
        ))

    if record:
        if cand_clock_in is not None:
            record.clock_in = cand_clock_in
        if cand_clock_out is not None:
            record.clock_out = cand_clock_out
        if incoming_in1 is not None:
            record.in1 = incoming_in1
        if "out1" in fields_set:
            record.out1 = data.out1
        if "in2" in fields_set:
            record.in2 = data.in2
        if incoming_out2 is not None:
            record.out2 = incoming_out2
        if "extra_in" in fields_set:
            record.extra_in = data.extra_in
        if "extra_out" in fields_set:
            record.extra_out = data.extra_out
        if "lunch" in fields_set:
            record.lunch = data.lunch
        record.overtime_minutes = cand_ot
        record.updated_at = now

        if incoming_in1 is not None:
            _log("in1", time_value=incoming_in1, record_id=record.id)
        if "out1" in fields_set:
            _log("out1", time_value=data.out1, record_id=record.id)
        if "in2" in fields_set:
            _log("in2", time_value=data.in2, record_id=record.id)
        if incoming_out2 is not None:
            _log("out2", time_value=incoming_out2, record_id=record.id)
        _log("overtime_minutes", overtime_minutes=cand_ot, record_id=record.id)
    else:
        record = DailyRecord(
            id=str(uuid.uuid4()),
            date=data.date,
            user_id=data.user_id,
            clock_in=cand_clock_in,
            clock_out=cand_clock_out,
            in1=cand_in1,
            out1=cand_out1,
            in2=cand_in2,
            out2=cand_out2,
            extra_in=cand_extra_in,
            extra_out=cand_extra_out,
            overtime_minutes=cand_ot,
            lunch=cand_lunch,
            geo_source="service_account",
            updated_at=now,
            created_at=now,
        )
        db.add(record)
        await db.flush()

        if cand_in1:
            _log("in1", time_value=cand_in1, record_id=record.id)
        if cand_out1:
            _log("out1", time_value=cand_out1, record_id=record.id)
        if cand_in2:
            _log("in2", time_value=cand_in2, record_id=record.id)
        if cand_out2:
            _log("out2", time_value=cand_out2, record_id=record.id)
        _log("overtime_minutes", overtime_minutes=cand_ot, record_id=record.id)

    # Sincroniza banco de horas
    tb_res = await db.execute(
        select(TimeBankEntry).where(
            TimeBankEntry.daily_record_id == record.id,
            TimeBankEntry.entry_type == "auto",
        )
    )
    tb_entry = tb_res.scalar_one_or_none()

    if cand_ot > 0:
        if tb_entry:
            tb_entry.amount_minutes = cand_ot
            tb_entry.description = f"Horas extras geradas no dia {record.date}"
        else:
            db.add(TimeBankEntry(
                id=str(uuid.uuid4()),
                user_id=data.user_id,
                daily_record_id=record.id,
                date=record.date,
                amount_minutes=cand_ot,
                description=f"Horas extras geradas no dia {record.date}",
                entry_type="auto",
                created_at=now,
            ))
    elif tb_entry:
        await db.delete(tb_entry)

    await db.commit()
    await db.refresh(record)
    return DailyRecordOut.model_validate(record)
