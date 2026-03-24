import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import AbsenceJustification, User
from schemas import AbsenceJustificationOut

router = APIRouter()


def _upload_dir() -> Path:
    # Keep it simple: local disk storage. Can be swapped to S3 later.
    base = os.getenv("UPLOAD_DIR", "uploads")
    p = Path(base)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _ensure_can_access(current_user: User, record: AbsenceJustification) -> None:
    if current_user.role != "admin" and record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")


@router.get("", response_model=List[AbsenceJustificationOut])
async def list_justifications(
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(AbsenceJustification)

    if current_user.role != "admin":
        q = q.where(AbsenceJustification.user_id == current_user.id)
    elif userId:
        q = q.where(AbsenceJustification.user_id == userId)

    if date:
        q = q.where(AbsenceJustification.date == date)
    elif month:
        q = q.where(AbsenceJustification.date.like(f"{month}%"))

    q = q.order_by(AbsenceJustification.date.desc())
    result = await db.execute(q)
    return [AbsenceJustificationOut.model_validate(r) for r in result.scalars().all()]


@router.post("", response_model=AbsenceJustificationOut)
async def create_justification(
    date: str = Form(...),
    reasonText: str = Form(""),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not reasonText and file is None:
        raise HTTPException(status_code=400, detail="Provide reasonText or a file")

    record = AbsenceJustification(
        id=str(uuid.uuid4()),
        date=date,
        reason_text=reasonText or None,
        user_id=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    if file is not None:
        # Basic allowlist
        allowed = {
            "application/pdf",
            "image/jpeg",
            "image/png",
        }
        if file.content_type and file.content_type not in allowed:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        ext = Path(file.filename or "").suffix
        dest_name = f"{uuid.uuid4().hex}{ext}"
        dest_path = _upload_dir() / dest_name

        with dest_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)

        record.file_path = str(dest_path)
        record.original_filename = file.filename
        record.mime_type = file.content_type
        try:
            record.size_bytes = dest_path.stat().st_size
        except Exception:
            record.size_bytes = None

    db.add(record)
    await db.commit()
    await db.refresh(record)
    return AbsenceJustificationOut.model_validate(record)


@router.get("/{justification_id}/file")
async def download_justification_file(
    justification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AbsenceJustification).where(AbsenceJustification.id == justification_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Not found")

    _ensure_can_access(current_user, record)

    if not record.file_path:
        raise HTTPException(status_code=404, detail="No file")

    p = Path(record.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File missing")

    return FileResponse(
        path=str(p),
        media_type=record.mime_type or "application/octet-stream",
        filename=record.original_filename or p.name,
    )


@router.delete("/{justification_id}")
async def delete_justification(
    justification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AbsenceJustification).where(AbsenceJustification.id == justification_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Not found")

    _ensure_can_access(current_user, record)

    # Remove file best-effort
    if record.file_path:
        try:
            Path(record.file_path).unlink(missing_ok=True)
        except Exception:
            pass

    await db.delete(record)
    await db.commit()
    return {"ok": True}
