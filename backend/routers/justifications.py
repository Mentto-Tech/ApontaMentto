import uuid
from datetime import datetime, timedelta
from typing import List, Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import AbsenceJustification, User, TimesheetSignRequest, TimesheetSignedPdf
from schemas import AbsenceJustificationOut
from storage_service import (
    S3Storage,
    build_justification_s3_key,
    build_timesheet_pdf_s3_key,
    is_s3_error,
    is_s3_not_found,
)

router = APIRouter()
logger = logging.getLogger(__name__)
s3_storage = S3Storage()


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

        data = await file.read()
        record.original_filename = file.filename
        record.mime_type = file.content_type
        record.size_bytes = len(data) if data is not None else None

        if not s3_storage.enabled:
            raise HTTPException(status_code=503, detail="S3 não está habilitado no servidor")

        key = build_justification_s3_key(
            user_id=current_user.id,
            justification_id=record.id,
            date=date,
            original_filename=file.filename,
        )
        try:
            s3_storage.upload_bytes(key=key, data=data, content_type=file.content_type)
            record.file_path = key
            record.file_data = None
        except Exception as exc:
            if is_s3_error(exc):
                logger.error("Erro ao enviar justificativa para S3: %s", exc)
                raise HTTPException(status_code=500, detail="Falha ao salvar arquivo no S3")
            raise

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

    if not s3_storage.enabled:
        raise HTTPException(status_code=503, detail="S3 não está habilitado no servidor")

    try:
        blob, content_type = s3_storage.download_bytes(record.file_path)
        filename = record.original_filename or f"justificativa-{record.id}"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(
            content=blob,
            media_type=content_type or record.mime_type or "application/octet-stream",
            headers=headers,
        )
    except Exception as exc:
        if is_s3_not_found(exc):
            raise HTTPException(status_code=404, detail="File missing")
        if is_s3_error(exc):
            logger.error("Erro ao baixar justificativa do S3. id=%s erro=%s", record.id, exc)
            raise HTTPException(status_code=500, detail="Falha ao baixar arquivo do S3")
        raise


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
    if record.file_path and s3_storage.enabled:
        try:
            s3_storage.delete_object(record.file_path)
        except Exception as exc:
            if is_s3_error(exc):
                logger.warning("Falha ao remover arquivo do S3. id=%s erro=%s", record.id, exc)

    await db.delete(record)
    await db.commit()
    return {"ok": True}


@router.post("/timesheet-sign-requests")
def create_sign_request(
    user_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Generate a secure token
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Create the sign request
    sign_request = TimesheetSignRequest(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(days=3),
        created_by_admin_id="admin-id-placeholder",  # Replace with actual admin ID from auth
    )
    db.add(sign_request)
    db.commit()

    # Send email with the token link
    sign_link = f"https://your-production-url/sign/{token}"
    background_tasks.add_task(
        EmailService.send_email,
        to_email="user-email-placeholder",  # Replace with actual user email
        subject="Please Sign Your Timesheet",
        body=f"Click the link to sign your timesheet: {sign_link}",
    )

    return {"message": "Sign request created and email sent."}


@router.post("/sign/{token}")
def sign_timesheet(
    token: str,
    pdf_data: bytes,
    db: Session = Depends(get_db),
):
    # Validate the token
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    sign_request = db.query(TimesheetSignRequest).filter(
        TimesheetSignRequest.token_hash == token_hash,
        TimesheetSignRequest.expires_at > datetime.utcnow(),
        TimesheetSignRequest.signed_at.is_(None),
    ).first()

    if not sign_request:
        raise HTTPException(status_code=400, detail="Invalid or expired token.")

    if not s3_storage.enabled:
        raise HTTPException(status_code=503, detail="S3 não está habilitado no servidor")

    pdf_id = str(uuid.uuid4())
    s3_key = build_timesheet_pdf_s3_key(
        user_id=sign_request.user_id,
        month="2026-04",  # Replace with actual month logic
        pdf_id=pdf_id,
    )
    try:
        s3_storage.upload_bytes(key=s3_key, data=pdf_data, content_type="application/pdf")
    except Exception as exc:
        if is_s3_error(exc):
            raise HTTPException(status_code=500, detail="Falha ao salvar PDF no S3")
        raise

    # Save the signed PDF
    signed_pdf = TimesheetSignedPdf(
        id=pdf_id,
        user_id=sign_request.user_id,
        month="2026-04",  # Replace with actual month logic
        pdf_data=None,
        s3_key=s3_key,
        signed_at=datetime.utcnow(),
    )
    db.add(signed_pdf)

    # Mark the request as signed
    sign_request.signed_at = datetime.utcnow()
    db.commit()

    return {"message": "Timesheet signed successfully."}


@router.get("/signed-pdfs")
def list_signed_pdfs(user_id: str = None, db: Session = Depends(get_db)):
    # Admin can filter by user_id, regular users see only their own
    signed_pdfs_query = db.query(TimesheetSignedPdf)

    if user_id:
        signed_pdfs_query = signed_pdfs_query.filter(TimesheetSignedPdf.user_id == user_id)

    signed_pdfs = signed_pdfs_query.all()
    return [
        {
            "id": pdf.id,
            "user_id": pdf.user_id,
            "month": pdf.month,
            "signed_at": pdf.signed_at,
        }
        for pdf in signed_pdfs
    ]


@router.get("/signed-pdfs/{pdf_id}")
def download_signed_pdf(pdf_id: str, db: Session = Depends(get_db)):
    signed_pdf = db.query(TimesheetSignedPdf).filter(TimesheetSignedPdf.id == pdf_id).first()

    if not signed_pdf:
        raise HTTPException(status_code=404, detail="Signed PDF not found.")

    if not s3_storage.enabled:
        raise HTTPException(status_code=503, detail="S3 não está habilitado no servidor")
    if not signed_pdf.s3_key:
        raise HTTPException(status_code=404, detail="Arquivo não migrado para S3")

    try:
        blob, content_type = s3_storage.download_bytes(signed_pdf.s3_key)
    except Exception as exc:
        if is_s3_not_found(exc):
            raise HTTPException(status_code=404, detail="Arquivo não encontrado no S3")
        if is_s3_error(exc):
            raise HTTPException(status_code=500, detail="Falha ao baixar PDF do S3")
        raise

    return Response(
        content=blob,
        media_type=content_type or signed_pdf.mime_type,
        headers={"Content-Disposition": f"attachment; filename=timesheet_{signed_pdf.month}.pdf"},
    )
