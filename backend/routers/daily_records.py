import uuid
from datetime import datetime, date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import DailyRecord, PunchLog, User, TimeBankEntry
from schemas import DailyRecordIn, DailyRecordOut

router = APIRouter()

# ---------------------------------------------------------------------------
# Jornada padrão por categoria (em minutos)
# ---------------------------------------------------------------------------
_DAILY_THRESHOLD = {
    "clt": 480,       # 8h
    "estagiario": 360, # 6h
}


def _to_mins(t: Optional[str]) -> Optional[int]:
    """Converte 'HH:MM' para minutos desde meia-noite. Retorna None se inválido."""
    if not t:
        return None
    try:
        h, m = map(int, t.split(":"))
        return h * 60 + m
    except Exception:
        return None


def _auto_overtime_minutes(
    category: str,
    date_str: str,
    in1: Optional[str],
    out1: Optional[str],
    in2: Optional[str],
    out2: Optional[str],
    extra_in: Optional[str] = None,
    extra_out: Optional[str] = None,
) -> int:
    """
    Calcula horas extras automaticamente com base nos horários de ponto.

    Regras:
    - CLT (8h/dia):       (out1-in1) + (out2-in2). Requer todos os 4 horários.
                          Fallback legacy: apenas in1+out2 sem almoço → out2-in1.
    - Estagiário (6h/dia): (out1-in1) + (out2-in2). Requer todos os 4 horários.
                            Fallback legacy: apenas in1+out2 sem almoço → out2-in1.
    - Fim de semana:       todo tempo trabalhado vira HE (threshold=0).
    - PJ / dono:           sem cálculo automático (retorna 0).
    """
    # Verifica se é final de semana
    try:
        d = date_type.fromisoformat(date_str)
        is_weekend = d.weekday() >= 5  # 5=Sáb, 6=Dom
    except Exception:
        is_weekend = False

    m_in1  = _to_mins(in1)
    m_out1 = _to_mins(out1)
    m_in2  = _to_mins(in2)
    m_out2 = _to_mins(out2)
    m_extra_in = _to_mins(extra_in)
    m_extra_out = _to_mins(extra_out)

    intervals = []
    if m_in1 is not None and m_out1 is not None and m_in2 is not None and m_out2 is not None:
        intervals.extend([(m_in1, m_out1), (m_in2, m_out2)])
    elif m_in1 is not None and m_out2 is not None and m_out1 is None and m_in2 is None:
        intervals.append((m_in1, m_out2))
    else:
        if m_in1 is not None and m_out1 is not None:
            intervals.append((m_in1, m_out1))
        if m_in2 is not None and m_out2 is not None:
            intervals.append((m_in2, m_out2))

    extra_worked = max(0, m_extra_out - m_extra_in) if m_extra_in is not None and m_extra_out is not None else 0

    if m_extra_in is not None and m_extra_out is not None:
        intervals.append((m_extra_in, m_extra_out))

    valid_intervals = [i for i in intervals if i[1] > i[0]]
    total_worked = 0
    if valid_intervals:
        valid_intervals.sort(key=lambda x: x[0])
        merged = [list(valid_intervals[0])]
        for current in valid_intervals[1:]:
            last = merged[-1]
            if current[0] <= last[1]:
                last[1] = max(last[1], current[1])
            else:
                merged.append(list(current))
        total_worked = sum(e - s for s, e in merged)

    if total_worked <= 0:
        return 0

    if is_weekend:
        return total_worked

    threshold = _DAILY_THRESHOLD.get(category)
    if threshold is None:
        return extra_worked

    return max(0, total_worked - threshold)


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

    fields_set = set(data.model_fields_set)

    # For new records, we need an object for validation/merge.
    existing_in1 = record.in1 if record else None
    existing_out1 = record.out1 if record else None
    existing_in2 = record.in2 if record else None
    existing_out2 = record.out2 if record else None
    existing_extra_in = record.extra_in if record else None
    existing_extra_out = record.extra_out if record else None
    existing_ot = record.overtime_minutes if record else None
    existing_clock_in = record.clock_in if record else None
    existing_clock_out = record.clock_out if record else None
    existing_lunch = record.lunch if record else None

    incoming_in1 = None
    if "in1" in fields_set:
        incoming_in1 = data.in1
    elif "clock_in" in fields_set:
        incoming_in1 = data.clock_in

    incoming_out2 = None
    if "out2" in fields_set:
        incoming_out2 = data.out2
    elif "clock_out" in fields_set:
        incoming_out2 = data.clock_out

    incoming_out1 = data.out1 if "out1" in fields_set else None
    incoming_in2 = data.in2 if "in2" in fields_set else None
    incoming_extra_in = data.extra_in if "extra_in" in fields_set else None
    incoming_extra_out = data.extra_out if "extra_out" in fields_set else None
    incoming_lunch = data.lunch if "lunch" in fields_set else None

    cand_in1 = incoming_in1 if incoming_in1 is not None else existing_in1
    cand_out1 = incoming_out1 if "out1" in fields_set else existing_out1
    cand_in2 = incoming_in2 if "in2" in fields_set else existing_in2
    cand_out2 = incoming_out2 if incoming_out2 is not None else existing_out2
    cand_extra_in = incoming_extra_in if "extra_in" in fields_set else existing_extra_in
    cand_extra_out = incoming_extra_out if "extra_out" in fields_set else existing_extra_out
    cand_lunch = incoming_lunch if "lunch" in fields_set else existing_lunch

    # Hora extra é sempre calculada automaticamente — não aceitamos valor manual
    cand_ot = _auto_overtime_minutes(
        category=str(current_user.category.value if hasattr(current_user.category, 'value') else current_user.category),
        date_str=data.date,
        in1=cand_in1,
        out1=cand_out1,
        in2=cand_in2,
        out2=cand_out2,
        extra_in=cand_extra_in,
        extra_out=cand_extra_out,
    )

    # Keep legacy clock_in/out aligned when those are sent/derived
    cand_clock_in = existing_clock_in
    if "clock_in" in fields_set:
        cand_clock_in = data.clock_in
    elif incoming_in1 is not None:
        cand_clock_in = incoming_in1

    cand_clock_out = existing_clock_out
    if "clock_out" in fields_set:
        cand_clock_out = data.clock_out
    elif incoming_out2 is not None:
        cand_clock_out = incoming_out2

    # Enforce sequential punches (frontend also enforces, but keep backend safe).
    # Allowed patterns:
    # - Full folha: in1 -> out1 -> in2 -> out2 (with partials allowed, but never skipping)
    # - Legacy single pair: in1 + out2 with out1/in2 empty
    # Note: For legacy single pair, out2 can exist without out1/in2.
    if cand_out1 and not cand_in1:
        raise HTTPException(status_code=400, detail="out1 requires in1")

    if cand_in2 and not cand_out1:
        raise HTTPException(status_code=400, detail="in2 requires out1")

    if cand_out2 and (cand_out1 or cand_in2) and not cand_in2:
        raise HTTPException(status_code=400, detail="out2 requires in2")


    ip_address = _extract_client_ip(request)
    user_agent = request.headers.get("user-agent")
    now = datetime.utcnow()

    # Effective geo for logging (device when provided; otherwise ip-only)
    if data.geo_lat is not None and data.geo_lng is not None:
        log_geo_lat = data.geo_lat
        log_geo_lng = data.geo_lng
        log_geo_accuracy = data.geo_accuracy
        log_geo_source = data.geo_source or "device"
    else:
        log_geo_lat = None
        log_geo_lng = None
        log_geo_accuracy = None
        log_geo_source = "ip"

    def _log(field: str, *, time_value: str | None = None, overtime_minutes: int | None = None, daily_record_id: str | None = None):
        db.add(
            PunchLog(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                daily_record_id=daily_record_id,
                date=data.date,
                field=field,
                time_value=time_value,
                overtime_minutes=overtime_minutes,
                recorded_at=now,
                geo_lat=log_geo_lat,
                geo_lng=log_geo_lng,
                geo_accuracy=log_geo_accuracy,
                geo_source=log_geo_source,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )

    if record:
        # Apply only fields that were provided
        if cand_clock_in is not None and ("clock_in" in fields_set or incoming_in1 is not None):
            record.clock_in = cand_clock_in
        if cand_clock_out is not None and ("clock_out" in fields_set or incoming_out2 is not None):
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
        # Hora extra é sempre recalculada automaticamente
        record.overtime_minutes = cand_ot
        if "lunch" in fields_set:
            record.lunch = data.lunch

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

        # Punch logs (only for fields explicitly sent)
        if incoming_in1 is not None:
            _log("in1", time_value=incoming_in1, daily_record_id=record.id)
        if "out1" in fields_set:
            _log("out1", time_value=data.out1, daily_record_id=record.id)
        if "in2" in fields_set:
            _log("in2", time_value=data.in2, daily_record_id=record.id)
        if incoming_out2 is not None:
            _log("out2", time_value=incoming_out2, daily_record_id=record.id)
        if "extra_in" in fields_set:
            _log("extra_in", time_value=data.extra_in, daily_record_id=record.id)
        if "extra_out" in fields_set:
            _log("extra_out", time_value=data.extra_out, daily_record_id=record.id)
        # Log overtime auto-calculado (sempre que houver mudança em qualquer ponto)
        _log("overtime_minutes", overtime_minutes=cand_ot, daily_record_id=record.id)
        if incoming_lunch is not None:
            _log("lunch", time_value=incoming_lunch, daily_record_id=record.id if record else None)
    else:
        record = DailyRecord(
            id=str(uuid.uuid4()),
            date=data.date,
            clock_in=cand_clock_in,
            clock_out=cand_clock_out,

            in1=cand_in1,
            out1=cand_out1,
            in2=cand_in2,
            out2=cand_out2,
            extra_in=cand_extra_in,
            extra_out=cand_extra_out,
            overtime_minutes=cand_ot,

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

        await db.flush()

        # Punch logs (only for fields explicitly sent)
        if incoming_in1 is not None:
            _log("in1", time_value=incoming_in1, daily_record_id=record.id)
        if "out1" in fields_set:
            _log("out1", time_value=data.out1, daily_record_id=record.id)
        if "in2" in fields_set:
            _log("in2", time_value=data.in2, daily_record_id=record.id)
        if incoming_out2 is not None:
            _log("out2", time_value=incoming_out2, daily_record_id=record.id)
        if "extra_in" in fields_set:
            _log("extra_in", time_value=data.extra_in, daily_record_id=record.id)
        if "extra_out" in fields_set:
            _log("extra_out", time_value=data.extra_out, daily_record_id=record.id)
        # Log overtime auto-calculado
        _log("overtime_minutes", overtime_minutes=cand_ot, daily_record_id=record.id)
        if incoming_lunch is not None:
            _log("lunch", time_value=incoming_lunch, daily_record_id=record.id if record else None)

    # --- Sync Time Bank Entry for Overtime ---
    # DailyRecord é a única fonte de verdade para o banco de horas quando existe.
    # Usamos apenas cand_ot (overtime calculado automaticamente pelo ponto).
    # A soma com TimeEntries is_overtime NÃO ocorre aqui — _sync_time_bank_for_day
    # em time_entries.py agora verifica se há DailyRecord e, se houver, não cria
    # uma segunda entrada. Assim nunca há duplicidade.
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
                user_id=current_user.id,
                daily_record_id=record.id,
                date=record.date,
                amount_minutes=cand_ot,
                description=f"Horas extras geradas no dia {record.date}",
                entry_type="auto",
                created_at=datetime.utcnow(),
            ))
    else:
        # Overtime zerado — remove a entrada automática se existir
        if tb_entry:
            await db.delete(tb_entry)

    # Remove entradas órfãs com daily_record_id=NULL para o mesmo dia.
    # Isso limpa entradas antigas criadas pelo fluxo de TimeEntry antes da correção.
    orphan_res = await db.execute(
        select(TimeBankEntry).where(
            TimeBankEntry.user_id == current_user.id,
            TimeBankEntry.date == data.date,
            TimeBankEntry.entry_type == "auto",
            TimeBankEntry.daily_record_id == None,
        )
    )
    orphan = orphan_res.scalar_one_or_none()
    if orphan:
        await db.delete(orphan)

    await db.commit()
    await db.refresh(record)
    return DailyRecordOut.model_validate(record)
