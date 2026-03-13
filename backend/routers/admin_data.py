from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_admin_user
from models import DailyRecord, Location, Project, TimeEntry, User
from schemas import (
    AdminExport,
    AdminImportResult,
    DailyRecordOut,
    LocationOut,
    ProjectOut,
    TimeEntryOut,
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

    return AdminExport(
        version="1.0",
        exported_at=datetime.utcnow().isoformat(),
        users=[UserOut.model_validate(u) for u in users_result.scalars().all()],
        projects=[ProjectOut.model_validate(p) for p in projects_result.scalars().all()],
        locations=[LocationOut.model_validate(l) for l in locations_result.scalars().all()],
        time_entries=[TimeEntryOut.model_validate(e) for e in entries_result.scalars().all()],
        daily_records=[DailyRecordOut.model_validate(d) for d in daily_result.scalars().all()],
    )


@router.post("/import", response_model=AdminImportResult)
async def import_data(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminImportResult:
    """Full replace import.

    Deletes and recreates: projects, locations, time entries, daily records.
    Users are exported for convenience but are NOT imported.
    """

    projects_raw = data.get("projects", [])
    locations_raw = data.get("locations", [])
    time_entries_raw = data.get("timeEntries") or data.get("time_entries") or []
    daily_records_raw = data.get("dailyRecords") or data.get("daily_records") or []

    # --- Delete existing data (children first) ---
    await db.execute(delete(DailyRecord))
    await db.execute(delete(TimeEntry))
    await db.execute(delete(Location))
    await db.execute(delete(Project))

    counts = {"projects": 0, "locations": 0, "timeEntries": 0, "dailyRecords": 0}

    # --- Import Projects ---
    for p in projects_raw:
        proj = ProjectOut.model_validate(p)
        project = Project(**proj.model_dump(exclude_none=True))
        if project.created_at is None:
            project.created_at = datetime.utcnow()
        db.add(project)
        counts["projects"] += 1

    # --- Import Locations ---
    for loc in locations_raw:
        loc_model = LocationOut.model_validate(loc)
        location = Location(**loc_model.model_dump(exclude_none=True))
        if location.created_at is None:
            location.created_at = datetime.utcnow()
        db.add(location)
        counts["locations"] += 1

    await db.flush()  # ensure FK targets exist

    # --- Import Time Entries ---
    for e in time_entries_raw:
        entry_model = TimeEntryOut.model_validate(e)
        entry = TimeEntry(**entry_model.model_dump(exclude_none=True))
        if entry.created_at is None:
            entry.created_at = datetime.utcnow()
        db.add(entry)
        counts["timeEntries"] += 1

    # --- Import Daily Records ---
    for d in daily_records_raw:
        rec_model = DailyRecordOut.model_validate(d)
        record = DailyRecord(**rec_model.model_dump(exclude_none=True))
        if record.created_at is None:
            record.created_at = datetime.utcnow()
        db.add(record)
        counts["dailyRecords"] += 1

    await db.commit()
    return AdminImportResult(ok=True, imported=counts)
