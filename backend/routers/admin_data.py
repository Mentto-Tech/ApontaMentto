from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from dependencies import get_db
from models import User, Project, Location, TimeEntry, DailyRecord
import schemas
from security import get_current_active_user

router = APIRouter()

@router.get("/export", response_model=schemas.AdminData)
def export_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = db.query(User).all()
    projects = db.query(Project).all()
    locations = db.query(Location).all()
    time_entries = db.query(TimeEntry).all()
    daily_records = db.query(DailyRecord).all()
    
    return schemas.AdminData(
        users=[schemas.UserOut.from_orm(u) for u in users],
        projects=[schemas.ProjectOut.from_orm(p) for p in projects],
        locations=[schemas.LocationOut.from_orm(l) for l in locations],
        time_entries=[schemas.TimeEntryOut.from_orm(t) for t in time_entries],
        daily_records=[schemas.DailyRecordOut.from_orm(d) for d in daily_records],
    )

@router.post("/import")
def import_data(data: schemas.AdminData, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")

    # This is a simple merge import. It doesn't handle updates or deletions.
    # It skips existing entries based on ID.
    
    # Import users
    for user_data in data.users:
        if not db.query(User).filter(User.id == user_data.id).first():
            db_user = User(**user_data.dict(exclude_unset=True))
            db.add(db_user)

    # Import projects
    for project_data in data.projects:
        if not db.query(Project).filter(Project.id == project_data.id).first():
            db_project = Project(**project_data.dict(exclude_unset=True))
            db.add(db_project)

    # Import locations
    for location_data in data.locations:
        if not db.query(Location).filter(Location.id == location_data.id).first():
            db_location = Location(**location_data.dict(exclude_unset=True))
            db.add(db_location)

    # Import daily_records
    for record_data in data.daily_records:
        if not db.query(DailyRecord).filter(DailyRecord.id == record_data.id).first():
            db_record = DailyRecord(**record_data.dict(exclude={"time_entries"}, exclude_unset=True))
            db.add(db_record)

    # Import time_entries
    for entry_data in data.time_entries:
        if not db.query(TimeEntry).filter(TimeEntry.id == entry_data.id).first():
            db_entry = TimeEntry(**entry_data.dict(exclude_unset=True))
            db.add(db_entry)
            
    db.commit()
    return {"message": "Data imported successfully"}
            "name": p.name,
            "description": p.description,
            "color": p.color,
            "isInternal": p.is_internal,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
        }

    def location_dict(loc: Location) -> dict:
        return {
            "id": loc.id,
            "name": loc.name,
            "address": loc.address,
            "createdAt": loc.created_at.isoformat() if loc.created_at else None,
        }

    def entry_dict(e: TimeEntry) -> dict:
        return {
            "id": e.id,
            "date": e.date,
            "startTime": e.start_time,
            "endTime": e.end_time,
            "projectId": e.project_id,
            "locationId": e.location_id,
            "notes": e.notes,
            "entryType": e.entry_type,
            "isOvertime": e.is_overtime,
            "userId": e.user_id,
            "createdAt": e.created_at.isoformat() if e.created_at else None,
        }

    def daily_dict(d: DailyRecord) -> dict:
        return {
            "id": d.id,
            "date": d.date,
            "clockIn": d.clock_in,
            "clockOut": d.clock_out,
            "userId": d.user_id,
            "createdAt": d.created_at.isoformat() if d.created_at else None,
        }

    return {
        "version": "1.0",
        "exportedAt": datetime.utcnow().isoformat(),
        "users": [user_dict(u) for u in users_result.scalars().all()],
        "projects": [project_dict(p) for p in projects_result.scalars().all()],
        "locations": [location_dict(loc) for loc in locations_result.scalars().all()],
        "timeEntries": [entry_dict(e) for e in entries_result.scalars().all()],
        "dailyRecords": [daily_dict(d) for d in daily_result.scalars().all()],
    }


@router.post("/import")
async def import_all(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> Dict[str, Any]:
    """Import data as full replace — deletes existing data and inserts from JSON.

    Order matters due to FK constraints: delete children first, then parents.
    Insert parents first, then children.
    Users are NOT deleted/replaced (to preserve auth credentials).
    """

    # --- Delete existing data (children first) ---
    await db.execute(delete(DailyRecord))
    await db.execute(delete(TimeEntry))
    await db.execute(delete(Location))
    await db.execute(delete(Project))

    counts = {"projects": 0, "locations": 0, "timeEntries": 0, "dailyRecords": 0}

    # --- Import Projects ---
    for p in data.get("projects", []):
        project = Project(
            id=p.get("id", str(uuid.uuid4())),
            name=p["name"],
            description=p.get("description", ""),
            color=p.get("color", "#0f766e"),
            is_internal=p.get("isInternal", False),
            created_at=datetime.fromisoformat(p["createdAt"]) if p.get("createdAt") else datetime.utcnow(),
        )
        db.add(project)
        counts["projects"] += 1

    # --- Import Locations ---
    for loc in data.get("locations", []):
        location = Location(
            id=loc.get("id", str(uuid.uuid4())),
            name=loc["name"],
            address=loc.get("address", ""),
            created_at=datetime.fromisoformat(loc["createdAt"]) if loc.get("createdAt") else datetime.utcnow(),
        )
        db.add(location)
        counts["locations"] += 1

    await db.flush()  # ensure FK targets exist

    # --- Import Time Entries ---
    for e in data.get("timeEntries", []):
        entry = TimeEntry(
            id=e.get("id", str(uuid.uuid4())),
            date=e["date"],
            start_time=e["startTime"],
            end_time=e["endTime"],
            project_id=e.get("projectId"),
            location_id=e.get("locationId"),
            notes=e.get("notes", ""),
            entry_type=e.get("entryType", "work"),
            is_overtime=e.get("isOvertime", False),
            user_id=e.get("userId"),
            created_at=datetime.fromisoformat(e["createdAt"]) if e.get("createdAt") else datetime.utcnow(),
        )
        db.add(entry)
        counts["timeEntries"] += 1

    # --- Import Daily Records ---
    for d in data.get("dailyRecords", []):
        record = DailyRecord(
            id=d.get("id", str(uuid.uuid4())),
            date=d["date"],
            clock_in=d.get("clockIn"),
            clock_out=d.get("clockOut"),
            user_id=d["userId"],
            created_at=datetime.fromisoformat(d["createdAt"]) if d.get("createdAt") else datetime.utcnow(),
        )
        db.add(record)
        counts["dailyRecords"] += 1

    await db.commit()

    return {"ok": True, "imported": counts}
