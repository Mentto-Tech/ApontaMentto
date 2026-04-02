"""
Timesheet signing flow:
  POST /api/timesheets/sign-request          — admin creates request + sends email to employee
  GET  /api/timesheets/sign-request/{token}  — public: validate token, return metadata
  POST /api/timesheets/sign-request/{token}/employee-sign — public: employee signs
  GET  /api/timesheets/signed-pdfs           — admin: list completed PDFs (filter by user_id)
  GET  /api/timesheets/signed-pdfs/{id}      — download PDF
  GET  /api/timesheets/sign-requests         — admin: list all sign requests
  GET  /api/timesheets/my-sign-requests      — employee: list own pending requests
"""

import hashlib
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_admin_user, get_current_user
from email_service import EmailService
from models import TimesheetSignRequest, TimesheetSignedPdf, User
from schemas import (
    CreateSignRequestIn,
    EmployeeSignIn,
    TimesheetSignedPdfOut,
    TimesheetSignRequestOut,
)

router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _build_pdf_bytes(
    month: str,
    employee_name: str,
    manager_name: str,
    manager_sig_dataurl: str | None,
    employee_sig_dataurl: str | None,
) -> bytes:
    """Generate a minimal PDF with both signatures using jsPDF-equivalent via reportlab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
        import base64
        from PIL import Image as PILImage

        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)
        w, h = A4

        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(w / 2, h - 60, "FOLHA DE PONTO ASSINADA")
        c.setFont("Helvetica", 11)
        c.drawString(40, h - 90, f"Funcionário: {employee_name}")
        c.drawString(40, h - 108, f"Mês: {month}")
        c.drawString(40, h - 126, f"Gestor: {manager_name}")

        def _draw_sig(dataurl: str | None, label: str, x: float, y: float):
            if not dataurl:
                return
            try:
                header, b64 = dataurl.split(",", 1)
                img_bytes = base64.b64decode(b64)
                img_buf = io.BytesIO(img_bytes)
                img = PILImage.open(img_buf)
                tmp = io.BytesIO()
                img.save(tmp, format="PNG")
                tmp.seek(0)
                from reportlab.lib.utils import ImageReader
                c.drawImage(ImageReader(tmp), x, y, width=160, height=50, preserveAspectRatio=True)
            except Exception:
                pass
            c.setFont("Helvetica", 9)
            c.drawString(x, y - 12, label)
            c.line(x, y - 2, x + 160, y - 2)

        _draw_sig(manager_sig_dataurl, f"{manager_name} (Gestor)", 40, h - 220)
        _draw_sig(employee_sig_dataurl, f"{employee_name} (Funcionário)", 280, h - 220)

        c.save()
        return buf.getvalue()
    except ImportError:
        # Fallback: plain text PDF-like bytes (won't render as real PDF without reportlab)
        return b"%PDF-1.4 placeholder - install reportlab and pillow"


# ---------------------------------------------------------------------------
# Admin: create sign request
# ---------------------------------------------------------------------------
@router.post("/sign-request", response_model=TimesheetSignRequestOut)
async def create_sign_request(
    body: CreateSignRequestIn,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    # Fetch employee
    result = await db.execute(select(User).where(User.id == body.user_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(404, "Usuário não encontrado")

    # Generate token
    raw_token = str(uuid.uuid4())
    token_hash = _hash_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(days=3)

    req = TimesheetSignRequest(
        id=str(uuid.uuid4()),
        user_id=body.user_id,
        month=body.month,
        status="manager_signed",
        token_hash=token_hash,
        expires_at=expires_at,
        manager_signature=body.manager_signature,
        manager_signed_at=datetime.utcnow(),
        created_by_admin_id=admin.id,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    # Send email
    sign_url = f"{FRONTEND_URL}/assinar/{raw_token}"
    from calendar import month_name
    year, mon = body.month.split("-")
    month_label = f"{month_name[int(mon)]} {year}"
    EmailService.send_sign_request(
        to_email=employee.email,
        employee_name=employee.username,
        manager_name=admin.username,
        month_label=month_label,
        sign_url=sign_url,
    )

    return req


# ---------------------------------------------------------------------------
# Public: validate token
# ---------------------------------------------------------------------------
@router.get("/sign-request/{token}/info")
async def get_sign_request_info(token: str, db: AsyncSession = Depends(get_db)):
    token_hash = _hash_token(token)
    result = await db.execute(
        select(TimesheetSignRequest).where(TimesheetSignRequest.token_hash == token_hash)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Link inválido")
    if req.expires_at < datetime.utcnow():
        raise HTTPException(410, "Link expirado")
    if req.status == "complete":
        raise HTTPException(409, "Folha já assinada")

    emp_result = await db.execute(select(User).where(User.id == req.user_id))
    employee = emp_result.scalar_one_or_none()

    adm_result = await db.execute(select(User).where(User.id == req.created_by_admin_id))
    manager = adm_result.scalar_one_or_none()

    return {
        "id": req.id,
        "month": req.month,
        "status": req.status,
        "employeeName": employee.username if employee else "",
        "managerName": manager.username if manager else "",
        "managerSignature": req.manager_signature,
        "expiresAt": req.expires_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Public: employee signs
# ---------------------------------------------------------------------------
@router.post("/sign-request/{token}/employee-sign")
async def employee_sign(token: str, body: EmployeeSignIn, db: AsyncSession = Depends(get_db)):
    token_hash = _hash_token(token)
    result = await db.execute(
        select(TimesheetSignRequest).where(TimesheetSignRequest.token_hash == token_hash)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Link inválido")
    if req.expires_at < datetime.utcnow():
        raise HTTPException(410, "Link expirado")
    if req.status == "complete":
        raise HTTPException(409, "Folha já assinada")

    req.employee_signature = body.employee_signature
    req.employee_signed_at = datetime.utcnow()
    req.status = "complete"

    # Build PDF with both signatures
    emp_result = await db.execute(select(User).where(User.id == req.user_id))
    employee = emp_result.scalar_one_or_none()
    adm_result = await db.execute(select(User).where(User.id == req.created_by_admin_id))
    manager = adm_result.scalar_one_or_none()

    pdf_bytes = _build_pdf_bytes(
        month=req.month,
        employee_name=employee.username if employee else "",
        manager_name=manager.username if manager else "",
        manager_sig_dataurl=req.manager_signature,
        employee_sig_dataurl=body.employee_signature,
    )

    signed_pdf = TimesheetSignedPdf(
        id=str(uuid.uuid4()),
        user_id=req.user_id,
        month=req.month,
        pdf_data=pdf_bytes,
        signed_at=datetime.utcnow(),
        sign_request_id=req.id,
    )
    db.add(signed_pdf)
    await db.commit()
    await db.refresh(signed_pdf)

    # Notify manager
    from calendar import month_name as _mn
    year, mon = req.month.split("-")
    month_label = f"{_mn[int(mon)]} {year}"
    download_url = f"{FRONTEND_URL}/timesheet"
    if manager:
        EmailService.send_employee_signed_notification(
            to_email=manager.email,
            manager_name=manager.username,
            employee_name=employee.username if employee else "",
            month_label=month_label,
            download_url=download_url,
        )

    return {"ok": True, "pdfId": signed_pdf.id}


# ---------------------------------------------------------------------------
# Admin: list sign requests
# ---------------------------------------------------------------------------
@router.get("/sign-requests", response_model=list[TimesheetSignRequestOut])
async def list_sign_requests(
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    q = select(TimesheetSignRequest)
    if user_id:
        q = q.where(TimesheetSignRequest.user_id == user_id)
    result = await db.execute(q.order_by(TimesheetSignRequest.manager_signed_at.desc()))
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Employee: list own sign requests
# ---------------------------------------------------------------------------
@router.get("/my-sign-requests", response_model=list[TimesheetSignRequestOut])
async def my_sign_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TimesheetSignRequest)
        .where(TimesheetSignRequest.user_id == current_user.id)
        .order_by(TimesheetSignRequest.manager_signed_at.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# List signed PDFs (admin: all or filtered; employee: own)
# ---------------------------------------------------------------------------
@router.get("/signed-pdfs", response_model=list[TimesheetSignedPdfOut])
async def list_signed_pdfs(
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(TimesheetSignedPdf)
    if current_user.role != "admin":
        q = q.where(TimesheetSignedPdf.user_id == current_user.id)
    elif user_id:
        q = q.where(TimesheetSignedPdf.user_id == user_id)
    result = await db.execute(q.order_by(TimesheetSignedPdf.signed_at.desc()))
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Download signed PDF
# ---------------------------------------------------------------------------
@router.get("/signed-pdfs/{pdf_id}/download")
async def download_signed_pdf(
    pdf_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TimesheetSignedPdf).where(TimesheetSignedPdf.id == pdf_id))
    pdf = result.scalar_one_or_none()
    if not pdf:
        raise HTTPException(404, "PDF não encontrado")
    if current_user.role != "admin" and pdf.user_id != current_user.id:
        raise HTTPException(403, "Acesso negado")
    return Response(
        content=pdf.pdf_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="folha-ponto-{pdf.month}.pdf"'},
    )
