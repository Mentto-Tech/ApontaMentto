from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_admin_user
from models import (
    AbsenceJustification,
    DailyRecord,
    Location,
    Project,
    PunchLog,
    TimeBankEntry,
    TimeEntry,
    TimesheetSignRequest,
    User,
)
from schemas import (
    AbsenceJustificationOut,
    AdminExport,
    AdminImportResult,
    DailyRecordOut,
    LocationOut,
    ProjectOut,
    PunchLogOut,
    TimeBankEntryOut,
    TimeEntryOut,
    TimesheetSignRequestOut,
    UserOut,
)

router = APIRouter()


@router.get("/export", response_model=AdminExport)
async def export_data(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminExport:
    users_result = await db.execute(select(User).order_by(User.username))
    projects_result = await db.execute(select(Project).order_by(Project.created_at))
    locations_result = await db.execute(select(Location).order_by(Location.created_at))
    entries_result = await db.execute(select(TimeEntry).order_by(TimeEntry.date, TimeEntry.start_time))
    daily_result = await db.execute(select(DailyRecord).order_by(DailyRecord.date))
    justifications_result = await db.execute(select(AbsenceJustification).order_by(AbsenceJustification.date))
    punch_logs_result = await db.execute(select(PunchLog).order_by(PunchLog.recorded_at))
    time_bank_result = await db.execute(select(TimeBankEntry).order_by(TimeBankEntry.date))
    sign_requests_result = await db.execute(select(TimesheetSignRequest).order_by(TimesheetSignRequest.month))

    return AdminExport(
        version="2.0",
        exported_at=datetime.utcnow().isoformat(),
        users=[UserOut.model_validate(u) for u in users_result.scalars().all()],
        projects=[ProjectOut.model_validate(p) for p in projects_result.scalars().all()],
        locations=[LocationOut.model_validate(l) for l in locations_result.scalars().all()],
        time_entries=[TimeEntryOut.model_validate(e) for e in entries_result.scalars().all()],
        daily_records=[DailyRecordOut.model_validate(d) for d in daily_result.scalars().all()],
        absence_justifications=[
            AbsenceJustificationOut.model_validate(j)
            for j in justifications_result.scalars().all()
        ],
        punch_logs=[PunchLogOut.model_validate(pl) for pl in punch_logs_result.scalars().all()],
        time_bank_entries=[TimeBankEntryOut.model_validate(tb) for tb in time_bank_result.scalars().all()],
        timesheet_sign_requests=[
            TimesheetSignRequestOut.model_validate(sr)
            for sr in sign_requests_result.scalars().all()
        ],
    )


@router.post("/import", response_model=AdminImportResult)
async def import_data(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminImportResult:
    """Full replace import.

    Deletes and recreates all transactional data.
    Users are exported for reference but are NOT imported.
    TimesheetSignedPdf (binary PDFs) are not included in backup/restore.
    """

    projects_raw = data.get("projects", [])
    locations_raw = data.get("locations", [])
    time_entries_raw = data.get("timeEntries") or data.get("time_entries") or []
    daily_records_raw = data.get("dailyRecords") or data.get("daily_records") or []
    justifications_raw = data.get("absenceJustifications") or data.get("absence_justifications") or []
    punch_logs_raw = data.get("punchLogs") or data.get("punch_logs") or []
    time_bank_raw = data.get("timeBankEntries") or data.get("time_bank_entries") or []
    sign_requests_raw = data.get("timesheetSignRequests") or data.get("timesheet_sign_requests") or []

    # --- Delete existing data (children first to respect FK constraints) ---
    await db.execute(delete(TimesheetSignRequest))
    await db.execute(delete(TimeBankEntry))
    await db.execute(delete(PunchLog))
    await db.execute(delete(AbsenceJustification))
    await db.execute(delete(DailyRecord))
    await db.execute(delete(TimeEntry))
    await db.execute(delete(Location))
    await db.execute(delete(Project))

    counts: Dict[str, int] = {
        "projects": 0,
        "locations": 0,
        "timeEntries": 0,
        "dailyRecords": 0,
        "absenceJustifications": 0,
        "punchLogs": 0,
        "timeBankEntries": 0,
        "timesheetSignRequests": 0,
    }

    for p in projects_raw:
        proj = ProjectOut.model_validate(p)
        project = Project(**proj.model_dump(exclude_none=True))
        if project.created_at is None:
            project.created_at = datetime.utcnow()
        db.add(project)
        counts["projects"] += 1

    for loc in locations_raw:
        loc_model = LocationOut.model_validate(loc)
        location = Location(**loc_model.model_dump(exclude_none=True))
        if location.created_at is None:
            location.created_at = datetime.utcnow()
        db.add(location)
        counts["locations"] += 1

    await db.flush()  # ensure FK targets (projects, locations) exist

    for e in time_entries_raw:
        entry_model = TimeEntryOut.model_validate(e)
        entry = TimeEntry(**entry_model.model_dump(exclude_none=True))
        if entry.created_at is None:
            entry.created_at = datetime.utcnow()
        db.add(entry)
        counts["timeEntries"] += 1

    for d in daily_records_raw:
        rec_model = DailyRecordOut.model_validate(d)
        record = DailyRecord(**rec_model.model_dump(exclude_none=True))
        if record.created_at is None:
            record.created_at = datetime.utcnow()
        db.add(record)
        counts["dailyRecords"] += 1

    await db.flush()  # ensure daily_records exist before punch_logs / time_bank reference them

    for j in justifications_raw:
        just_model = AbsenceJustificationOut.model_validate(j)
        justification = AbsenceJustification(**just_model.model_dump(exclude_none=True))
        if justification.created_at is None:
            justification.created_at = datetime.utcnow()
        db.add(justification)
        counts["absenceJustifications"] += 1

    for pl in punch_logs_raw:
        pl_model = PunchLogOut.model_validate(pl)
        punch_log = PunchLog(**pl_model.model_dump(exclude_none=True))
        if punch_log.recorded_at is None:
            punch_log.recorded_at = datetime.utcnow()
        db.add(punch_log)
        counts["punchLogs"] += 1

    for tb in time_bank_raw:
        tb_model = TimeBankEntryOut.model_validate(tb)
        tb_entry = TimeBankEntry(**tb_model.model_dump(exclude_none=True))
        if tb_entry.created_at is None:
            tb_entry.created_at = datetime.utcnow()
        db.add(tb_entry)
        counts["timeBankEntries"] += 1

    for sr in sign_requests_raw:
        sr_model = TimesheetSignRequestOut.model_validate(sr)
        sign_req = TimesheetSignRequest(**sr_model.model_dump(exclude_none=True))
        db.add(sign_req)
        counts["timesheetSignRequests"] += 1

    await db.commit()
    return AdminImportResult(ok=True, imported=counts)
