import asyncio

from sqlalchemy import select

from database import AsyncSessionLocal
from models import AbsenceJustification, TimesheetSignedPdf
from storage_service import (
    S3Storage,
    build_justification_s3_key,
    build_timesheet_pdf_s3_key,
)


async def migrate() -> None:
    s3 = S3Storage()
    if not s3.enabled:
        raise RuntimeError("S3 não está habilitado. Configure S3_ENABLED=true e credenciais.")

    migrated_justifications = 0
    migrated_pdfs = 0

    async with AsyncSessionLocal() as db:
        # Justificativas legadas com file_data no banco
        result = await db.execute(
            select(AbsenceJustification).where(
                AbsenceJustification.file_data.is_not(None),
                AbsenceJustification.file_path.is_(None),
            )
        )
        justifications = result.scalars().all()

        for row in justifications:
            key = build_justification_s3_key(
                user_id=row.user_id,
                justification_id=row.id,
                date=row.date,
                original_filename=row.original_filename,
            )
            s3.upload_bytes(key=key, data=row.file_data, content_type=row.mime_type)
            row.file_path = key
            row.file_data = None
            migrated_justifications += 1

        # PDFs assinados legados com pdf_data no banco
        result = await db.execute(
            select(TimesheetSignedPdf).where(
                TimesheetSignedPdf.pdf_data.is_not(None),
                TimesheetSignedPdf.s3_key.is_(None),
            )
        )
        pdfs = result.scalars().all()

        for row in pdfs:
            key = build_timesheet_pdf_s3_key(user_id=row.user_id, month=row.month, pdf_id=row.id)
            s3.upload_bytes(key=key, data=row.pdf_data, content_type=row.mime_type or "application/pdf")
            row.s3_key = key
            row.pdf_data = None
            migrated_pdfs += 1

        await db.commit()

    print(f"Migração finalizada. Justificativas: {migrated_justifications}, PDFs: {migrated_pdfs}")


if __name__ == "__main__":
    asyncio.run(migrate())
