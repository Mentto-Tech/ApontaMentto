import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import TimeBankEntry, User
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
        description=data.description,
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
