import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import TimeBankEntry, User, DailyRecord
from schemas import TimeBankBalanceOut, TimeBankEntryIn, TimeBankEntryOut

router = APIRouter()


@router.get("", response_model=TimeBankBalanceOut)
async def get_time_bank(
    userId: Optional[str] = Query(None),
    month: Optional[str] = Query(None),  # Optional: for filtering entries by month (YYYY-MM)
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_user_id = current_user.id
    if userId:
        if current_user.role != "admin" and userId != current_user.id:
            raise HTTPException(403, "Sem permissão")
        target_user_id = userId

    # Calculate overall balance for this user (all time)
    balance_query = select(func.sum(TimeBankEntry.amount_minutes)).where(
        TimeBankEntry.user_id == target_user_id
    )
    balance_result = await db.execute(balance_query)
    total_balance = balance_result.scalar() or 0

    # Fetch entries, optionally filtered by month
    entries_query = select(TimeBankEntry).where(TimeBankEntry.user_id == target_user_id)
    if month:
        entries_query = entries_query.where(TimeBankEntry.date.like(f"{month}%"))
    entries_query = entries_query.order_by(TimeBankEntry.date.desc(), TimeBankEntry.created_at.desc())
    
    entries_result = await db.execute(entries_query)
    entries = entries_result.scalars().all()

    return TimeBankBalanceOut(
        total_balance_minutes=total_balance,
        entries=[TimeBankEntryOut.model_validate(e) for e in entries]
    )


@router.post("", response_model=TimeBankEntryOut)
async def create_manual_entry(
    data: TimeBankEntryIn,
    userId: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas administradores podem fazer lançamentos manuais")

    if data.entry_type not in ["manual_add", "manual_subtract"]:
        raise HTTPException(400, "Tipo de entrada inválido")

    # Ensure targeted user exists
    user_res = await db.execute(select(User).where(User.id == userId))
    if not user_res.scalar_one_or_none():
        raise HTTPException(404, "Usuário não encontrado")

    entry = TimeBankEntry(
        id=str(uuid.uuid4()),
        user_id=userId,
        date=data.date,
        amount_minutes=data.amount_minutes,
        description=data.description or ("Adição manual" if data.entry_type == "manual_add" else "Subtração manual"),
        entry_type=data.entry_type,
        created_at=datetime.utcnow()
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return TimeBankEntryOut.model_validate(entry)


@router.delete("/{entry_id}")
async def delete_manual_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Apenas administradores podem remover lançamentos manuais")

    result = await db.execute(select(TimeBankEntry).where(TimeBankEntry.id == entry_id))
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(404, "Registro não encontrado")

    if entry.entry_type == "auto":
        raise HTTPException(400, "Não é possível apagar um lançamento automático diretamente")

    await db.delete(entry)
    await db.commit()
    return {"ok": True}


@router.post("/sync", response_model=dict)
async def sync_time_bank_from_daily_records(
    userId: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sincroniza entradas automáticas do banco de horas a partir dos DailyRecords e TimeEntries existentes.
    Também recalcula o overtime_minutes de DailyRecords históricos usando a regra automática.
    """
    from models import TimeEntry
    from routers.daily_records import _auto_overtime_minutes

    target_user_id = current_user.id
    if userId:
        if current_user.role != "admin" and userId != current_user.id:
            raise HTTPException(403, "Sem permissão")
        target_user_id = userId

    created = 0
    updated = 0

    # Busca usuário alvo para o cálculo de categoria
    user_res = await db.execute(select(User).where(User.id == target_user_id))
    target_user = user_res.scalar_one_or_none()
    user_category = str(
        target_user.category.value
        if target_user and hasattr(target_user.category, "value")
        else (target_user.category if target_user else "")
    )

    # 1. Sync from DailyRecords — recalcula overtime automaticamente
    records_result = await db.execute(
        select(DailyRecord).where(DailyRecord.user_id == target_user_id)
    )
    for record in records_result.scalars().all():
        # Recalcula com a regra automática
        correct_ot = _auto_overtime_minutes(
            category=user_category,
            date_str=record.date,
            in1=record.in1,
            out1=record.out1,
            in2=record.in2,
            out2=record.out2,
        )

        # Corrige o DailyRecord se o valor está divergente
        if record.overtime_minutes != correct_ot:
            record.overtime_minutes = correct_ot

        tb_res = await db.execute(
            select(TimeBankEntry).where(
                TimeBankEntry.daily_record_id == record.id,
                TimeBankEntry.entry_type == "auto",
            )
        )
        tb_entry = tb_res.scalar_one_or_none()

        if correct_ot > 0:
            if tb_entry:
                if tb_entry.amount_minutes != correct_ot:
                    tb_entry.amount_minutes = correct_ot
                    tb_entry.description = f"Hora extra gerada no dia {record.date}"
                    updated += 1
            else:
                db.add(TimeBankEntry(
                    id=str(uuid.uuid4()),
                    user_id=target_user_id,
                    daily_record_id=record.id,
                    date=record.date,
                    amount_minutes=correct_ot,
                    description=f"Hora extra gerada no dia {record.date}",
                    entry_type="auto",
                    created_at=datetime.utcnow(),
                ))
                created += 1
        else:
            # Sem hora extra — remove entrada automática se existir
            if tb_entry:
                await db.delete(tb_entry)
                updated += 1

    # 2. Sync from TimeEntries (is_overtime=True)
    ot_entries_result = await db.execute(
        select(TimeEntry.date).where(
            TimeEntry.user_id == target_user_id,
            TimeEntry.is_overtime == True,
            TimeEntry.entry_type != "break",
        ).distinct()
    )
    overtime_dates = [row[0] for row in ot_entries_result.all()]

    for date in overtime_dates:
        day_entries_result = await db.execute(
            select(TimeEntry).where(
                TimeEntry.user_id == target_user_id,
                TimeEntry.date == date,
                TimeEntry.is_overtime == True,
                TimeEntry.entry_type != "break",
            )
        )
        day_entries = day_entries_result.scalars().all()
        total_minutes = sum(
            max(0, (int(e.end_time.split(":")[0]) * 60 + int(e.end_time.split(":")[1])) -
                   (int(e.start_time.split(":")[0]) * 60 + int(e.start_time.split(":")[1])))
            for e in day_entries
        )
        if total_minutes <= 0:
            continue

        tb_res = await db.execute(
            select(TimeBankEntry).where(
                TimeBankEntry.user_id == target_user_id,
                TimeBankEntry.date == date,
                TimeBankEntry.entry_type == "auto",
                TimeBankEntry.daily_record_id == None,
            )
        )
        tb_entry = tb_res.scalar_one_or_none()
        if tb_entry:
            if tb_entry.amount_minutes != total_minutes:
                tb_entry.amount_minutes = total_minutes
                tb_entry.description = "Hora extra"
                updated += 1
        else:
            db.add(TimeBankEntry(
                id=str(uuid.uuid4()),
                user_id=target_user_id,
                daily_record_id=None,
                date=date,
                amount_minutes=total_minutes,
                description="Hora extra",
                entry_type="auto",
                created_at=datetime.utcnow(),
            ))
            created += 1

    await db.commit()
    return {"created": created, "updated": updated}
