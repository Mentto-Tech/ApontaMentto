import datetime
import enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from datetime import datetime as dt


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class UserCategory(str, enum.Enum):
    pj = "pj"
    clt = "clt"
    estagiario = "estagiario"
    dono = "dono"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="userrole"),
        nullable=False,
        default=UserRole.user,
    )

    hourly_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overtime_hourly_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[UserCategory] = mapped_column(
        SAEnum(UserCategory, name="usercategory"),
        nullable=False,
        default=UserCategory.clt,
    )
    weekly_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow
    )

    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="user", cascade="all, delete-orphan"
    )
    daily_records: Mapped[List["DailyRecord"]] = relationship(
        "DailyRecord", back_populates="user", cascade="all, delete-orphan"
    )
    absence_justifications: Mapped[List["AbsenceJustification"]] = relationship(
        "AbsenceJustification", back_populates="user", cascade="all, delete-orphan"
    )
    punch_logs: Mapped[List["PunchLog"]] = relationship(
        "PunchLog", back_populates="user", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow
    )

    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="project"
    )


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow
    )

    time_entries: Mapped[List["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="location"
    )


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    start_time: Mapped[str] = mapped_column(String, nullable=False)  # HH:mm
    end_time: Mapped[str] = mapped_column(String, nullable=False)  # HH:mm
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entry_type: Mapped[str] = mapped_column(String, nullable=False, default="work")
    is_overtime: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    project_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("projects.id"), nullable=True
    )
    location_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("locations.id"), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow
    )

    user: Mapped[User] = relationship("User", back_populates="time_entries")
    project: Mapped[Optional[Project]] = relationship("Project", back_populates="time_entries")
    location: Mapped[Optional[Location]] = relationship("Location", back_populates="time_entries")


class DailyRecord(Base):
    """Optional clock-in / clock-out per day, independent of activities."""

    __tablename__ = "daily_records"
    __table_args__ = (
        UniqueConstraint("date", "user_id", name="uq_daily_record_date_user"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    clock_in: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    clock_out: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm

    # Folha de ponto (2 entradas / 2 saídas)
    in1: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    out1: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    in2: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    out2: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    overtime_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Captura de localização (device/IP)
    geo_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geo_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geo_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geo_source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime, nullable=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow
    )

    user: Mapped[User] = relationship("User", back_populates="daily_records")
    lunch: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm-HH:mm format for lunch break


class AbsenceJustification(Base):
    """Justificativa de falta (texto + anexo opcional)."""

    __tablename__ = "absence_justifications"
    __table_args__ = (
        UniqueConstraint("date", "user_id", name="uq_absence_justification_date_user"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    reason_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    file_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow
    )
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="absence_justifications")


class PunchLog(Base):
    """Log de batidas de ponto (uma linha por ação de registro)."""

    __tablename__ = "punch_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    daily_record_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("daily_records.id", ondelete="CASCADE"), nullable=True, index=True
    )

    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    field: Mapped[str] = mapped_column(String, nullable=False)  # in1/out1/in2/out2/overtime_minutes
    time_value: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:mm
    overtime_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    recorded_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow, nullable=False, index=True
    )

    # Localização/metadados no momento do registro
    geo_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geo_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geo_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    geo_source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="punch_logs")


class TimeBankEntry(Base):
    """
    Registro no Banco de Horas do usuário.
    Pode ser automático (via banco de horas extras diárias) ou manual (admin adicionando/removendo).
    """

    __tablename__ = "time_bank_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    daily_record_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("daily_records.id", ondelete="SET NULL"), nullable=True, index=True
    )

    date: Mapped[str] = mapped_column(String, nullable=False, index=True)  # YYYY-MM-DD
    amount_minutes: Mapped[int] = mapped_column(Integer, nullable=False)  # Positivo = crédito, Negativo = débito
    description: Mapped[str] = mapped_column(Text, nullable=False)  # Comentário ou justificativa automática
    entry_type: Mapped[str] = mapped_column(String, nullable=False)  # 'auto', 'manual_add', 'manual_subtract'

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: dt.utcnow, nullable=False
    )

    user: Mapped[User] = relationship("User")
    daily_record: Mapped[Optional[DailyRecord]] = relationship("DailyRecord")


class TimesheetSignRequest(Base):
    __tablename__ = "timesheet_sign_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False, default=lambda: datetime.utcnow() + timedelta(days=3))
    signed_at = Column(DateTime, nullable=True)
    created_by_admin_id = Column(String, ForeignKey("users.id"), nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])


class TimesheetSignedPdf(Base):
    __tablename__ = "timesheet_signed_pdfs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    month = Column(String, nullable=False)  # Format: YYYY-MM
    pdf_data = Column(LargeBinary, nullable=False)
    mime_type = Column(String, nullable=False, default="application/pdf")
    signed_at = Column(DateTime, nullable=False, default=lambda: dt.utcnow())

    user = relationship("User")
